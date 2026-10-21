from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import Comment, Post, PostLike, PostMedia, PostReport
from .serializers import CommentSerializer, PostCreateSerializer, PostSerializer, ReportSerializer

LikeResult = inline_serializer('LikeResult', {'liked': serializers.BooleanField(), 'like_count': serializers.IntegerField()})


def check_can_take_part(user):
    if user.is_banned or user.is_suspended:
        raise PermissionDenied('Your account is suspended, so you cannot post or comment right now.')


class PostViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """
    The community feed, newest first. Anyone can read; logged-in farmers post
    photos / videos (`multipart`: text, topic, files[]), like and comment.
    Filter with `?topic=` or `?author=<user id>`.
    """

    serializer_class = PostSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = Post.objects.none()  # for the API schema

    def get_queryset(self):
        user = self.request.user
        visible = Q(is_hidden=False)
        if user.is_authenticated:
            visible |= Q(author=user)  # authors still see their own hidden posts
        qs = (
            Post.objects.filter(visible)
            .select_related('author')
            .prefetch_related('media')
            .annotate(
                like_count=Count('likes', distinct=True),
                comment_count=Count('comments', filter=Q(comments__is_hidden=False), distinct=True),
                liked=Exists(PostLike.objects.filter(post=OuterRef('pk'), user_id=user.id or 0)),
            )
            .order_by('-created_at', '-id')  # Meta.ordering is dropped by aggregate queries
        )
        params = self.request.query_params
        if params.get('topic') in Post.Topic.values:
            qs = qs.filter(topic=params['topic'])
        if params.get('author', '').isdigit():
            qs = qs.filter(author_id=params['author'])
        return qs

    @extend_schema(parameters=[OpenApiParameter('topic', enum=Post.Topic.values, required=False),
                               OpenApiParameter('author', int, required=False)])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request={'multipart/form-data': PostCreateSerializer}, responses={201: PostSerializer})
    def create(self, request):
        check_can_take_part(request.user)
        since = timezone.now() - timedelta(days=1)
        if Post.objects.filter(author=request.user, created_at__gte=since).count() >= settings.COMMUNITY_POSTS_PER_DAY:
            raise ValidationError({'detail': f'You can share up to {settings.COMMUNITY_POSTS_PER_DAY} posts a day.'})
        serializer = PostCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            post = Post.objects.create(author=request.user, text=data['text'], topic=data['topic'])
            for i, (upload, kind) in enumerate(zip(data.get('files', []), data['kinds'])):
                PostMedia.objects.create(post=post, file=upload, kind=kind, sort_order=i)
        return Response(self.get_serializer(self.get_queryset().get(pk=post.pk)).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, post):
        user = self.request.user
        if post.author_id != user.id and not user.is_platform_admin:
            raise PermissionDenied('You can only delete your own posts.')
        for item in post.media.all():
            item.file.delete(save=False)
        post.delete()

    @extend_schema(request=None, responses=LikeResult)
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def like(self, request, pk=None):
        """Like, or unlike if already liked."""
        post = self.get_object()
        deleted, _ = PostLike.objects.filter(post=post, user=request.user).delete()
        if not deleted:
            try:
                PostLike.objects.create(post=post, user=request.user)
            except IntegrityError:
                pass  # a double tap raced us; it is liked either way
        return Response({'liked': not deleted, 'like_count': post.likes.count()})

    @extend_schema(methods=['get'], responses=CommentSerializer(many=True))
    @extend_schema(methods=['post'], request=CommentSerializer, responses={201: CommentSerializer})
    @action(detail=True, methods=['get', 'post'], permission_classes=[IsAuthenticatedOrReadOnly])
    def comments(self, request, pk=None):
        post = self.get_object()
        if request.method == 'POST':
            check_can_take_part(request.user)
            serializer = CommentSerializer(data=request.data, context={'request': request})
            serializer.is_valid(raise_exception=True)
            comment = serializer.save(post=post, author=request.user)
            return Response(CommentSerializer(comment, context={'request': request}).data, status=status.HTTP_201_CREATED)
        comments = post.comments.filter(is_hidden=False).select_related('author')
        return Response(CommentSerializer(comments, many=True, context={'request': request}).data)

    @extend_schema(request=ReportSerializer, responses=inline_serializer('Reported', {'detail': serializers.CharField()}))
    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def report(self, request, pk=None):
        """Report a post. After several reports it is hidden until an admin reviews it."""
        post = self.get_object()
        if post.author_id == request.user.id:
            raise ValidationError({'detail': 'You cannot report your own post.'})
        serializer = ReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _, created = PostReport.objects.get_or_create(post=post, reporter=request.user,
                                                      defaults={'reason': serializer.validated_data.get('reason', '')})
        if created and post.reports.count() >= settings.COMMUNITY_REPORTS_TO_HIDE:
            Post.objects.filter(pk=post.pk).update(is_hidden=True)
        return Response({'detail': 'Thank you. Our team will review this post.'})


class CommentViewSet(mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Delete a comment: its author, the post's author or an admin."""

    permission_classes = [IsAuthenticated]
    queryset = Comment.objects.select_related('post')

    def perform_destroy(self, comment):
        user = self.request.user
        if user.id not in (comment.author_id, comment.post.author_id) and not user.is_platform_admin:
            raise PermissionDenied('You cannot delete this comment.')
        comment.delete()
