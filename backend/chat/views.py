from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.models import public_products_q
from orders.services import has_paid_order

from .masking import mask_contact_details
from .models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer, StartConversationSerializer


def _my_conversations(user):
    return (
        Conversation.objects.filter(Q(buyer=user) | Q(seller=user))
        .select_related('buyer', 'seller', 'product')
        .prefetch_related('product__images')
        .annotate(unread=Count('messages', filter=Q(messages__read_at__isnull=True) & ~Q(messages__sender=user)))
    )


class ConversationListView(APIView):
    """Your conversations. `POST {product_id}` opens (or reuses) a chat with that listing's seller."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=ConversationSerializer(many=True))
    def get(self, request):
        data = ConversationSerializer(_my_conversations(request.user), many=True, context={'request': request}).data
        return Response(data)

    @extend_schema(request=StartConversationSerializer, responses=ConversationSerializer)
    def post(self, request):
        serializer = StartConversationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.validated_data['product']
        if not type(product).objects.filter(public_products_q(), pk=product.pk).exists():
            return Response({'detail': 'This listing is not available.'}, status=status.HTTP_400_BAD_REQUEST)
        if product.seller_id == request.user.id:
            return Response({'detail': 'This is your own listing.'}, status=status.HTTP_400_BAD_REQUEST)
        conv, _ = Conversation.objects.get_or_create(product=product, buyer=request.user, defaults={'seller': product.seller})
        conv = _my_conversations(request.user).get(pk=conv.pk)
        return Response(ConversationSerializer(conv, context={'request': request}).data)


class UnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=inline_serializer('Unread', {'unread': serializers.IntegerField()}))
    def get(self, request):
        user = request.user
        count = Message.objects.filter(
            Q(conversation__buyer=user) | Q(conversation__seller=user), read_at__isnull=True
        ).exclude(sender=user).count()
        return Response({'unread': count})


class MessageListView(APIView):
    """
    Messages in one conversation (marks them read). Until the buyer has paid for an
    order from this seller, phone numbers, links and emails are hidden automatically.
    """

    permission_classes = [IsAuthenticated]

    def _conversation(self, request, pk):
        return get_object_or_404(_my_conversations(request.user), pk=pk)

    @extend_schema(responses=inline_serializer('Thread', {
        'conversation': ConversationSerializer(),
        'messages': MessageSerializer(many=True),
        'contact_unlocked': serializers.BooleanField(),
    }))
    def get(self, request, pk):
        conv = self._conversation(request, pk)
        conv.messages.filter(read_at__isnull=True).exclude(sender=request.user).update(read_at=timezone.now())
        ctx = {'request': request}
        return Response({
            'conversation': ConversationSerializer(conv, context=ctx).data,
            'messages': MessageSerializer(conv.messages.all()[:500], many=True, context=ctx).data,
            'contact_unlocked': has_paid_order(conv.buyer, conv.seller),
        })

    @extend_schema(request=MessageSerializer, responses=MessageSerializer)
    def post(self, request, pk):
        conv = self._conversation(request, pk)
        serializer = MessageSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        body = serializer.validated_data['body'].strip()
        if not body:
            return Response({'body': ['Write a message.']}, status=status.HTTP_400_BAD_REQUEST)
        masked = False
        if not has_paid_order(conv.buyer, conv.seller):
            body, masked = mask_contact_details(body)
        message = Message.objects.create(conversation=conv, sender=request.user, body=body, was_masked=masked)
        Conversation.objects.filter(pk=conv.pk).update(last_message_at=message.created_at)
        return Response(MessageSerializer(message, context={'request': request}).data, status=status.HTTP_201_CREATED)
