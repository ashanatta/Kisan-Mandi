from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, F, Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import generics, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .filters import ProductFilter
from .models import Category, Product, SellerReview
from .permissions import IsSeller
from .serializers import (
    CategorySerializer,
    ProductDetailSerializer,
    ProductListSerializer,
    ProductWriteSerializer,
    SellerProductSerializer,
    SellerReviewSerializer,
)

User = get_user_model()

PUBLIC_PRODUCTS = Q(status=Product.Status.APPROVED, is_active=True)


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """Top-level categories with their sub-categories and live product counts."""

    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    pagination_class = None
    lookup_field = 'slug'

    def get_queryset(self):
        product_count = Count('products', filter=Q(products__status=Product.Status.APPROVED, products__is_active=True))
        children = Category.objects.filter(is_active=True).annotate(product_count=product_count)
        queryset = (
            Category.objects.filter(is_active=True)
            .annotate(product_count=product_count)
            .prefetch_related(Prefetch('children', queryset=children, to_attr='active_children'))
        )
        if self.action == 'list':
            queryset = queryset.filter(parent__isnull=True)
        return queryset

    def _add_children_counts(self, categories):
        for category in categories:
            category.product_count += sum(c.product_count for c in category.active_children)
        return categories

    def list(self, request, *args, **kwargs):
        categories = self._add_children_counts(list(self.get_queryset()))
        return Response(self.get_serializer(categories, many=True).data)

    def retrieve(self, request, *args, **kwargs):
        category = self._add_children_counts([self.get_object()])[0]
        return Response(self.get_serializer(category).data)


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Public product listings (approved and active only).
    Search: `?search=wheat`. Sort: `?ordering=price`, `-price`, `-created_at`, `-views_count`.
    """

    permission_classes = [AllowAny]
    filterset_class = ProductFilter
    search_fields = ('title', 'description', 'breed', 'brand', 'city', 'district', 'category__name')
    ordering_fields = ('price', 'created_at', 'views_count')
    ordering = ('-created_at',)

    def get_queryset(self):
        return (
            Product.objects.filter(PUBLIC_PRODUCTS)
            .select_related('category', 'seller')
            .prefetch_related('images')
        )

    def get_serializer_class(self):
        return ProductDetailSerializer if self.action == 'retrieve' else ProductListSerializer

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        Product.objects.filter(pk=instance.pk).update(views_count=F('views_count') + 1)
        instance.views_count += 1
        return Response(self.get_serializer(instance).data)


class MyProductViewSet(viewsets.ModelViewSet):
    """
    The logged-in seller's own listings (every status).
    Create / update with multipart form data; repeat `uploaded_images` for several photos.
    New listings start as `pending` until an admin approves them.
    """

    queryset = Product.objects.none()  # real queryset in get_queryset(); this one is for the API schema
    permission_classes = [IsSeller]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ('status', 'is_active')
    search_fields = ('title', 'description')
    ordering_fields = ('created_at', 'price', 'views_count')
    ordering = ('-created_at',)

    def get_queryset(self):
        return (
            Product.objects.filter(seller=self.request.user)
            .select_related('category', 'seller', 'linked_business')
            .prefetch_related('images')
        )

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ProductWriteSerializer
        return SellerProductSerializer

    def _respond(self, product, code=status.HTTP_200_OK):
        product = self.get_queryset().get(pk=product.pk)
        return Response(SellerProductSerializer(product, context=self.get_serializer_context()).data, status=code)

    @extend_schema(responses=SellerProductSerializer)
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            product = serializer.save()
        return self._respond(product, status.HTTP_201_CREATED)

    @extend_schema(responses=SellerProductSerializer)
    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=kwargs.get('partial', False))
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            product = serializer.save()
        return self._respond(product)

    def perform_destroy(self, instance):
        files = [img.image for img in instance.images.all()]
        instance.delete()
        for f in files:
            f.delete(save=False)

    @extend_schema(request=None, responses=SellerProductSerializer)
    @action(detail=True, methods=['delete'], url_path=r'images/(?P<image_id>\d+)')
    def delete_image(self, request, pk=None, image_id=None):
        product = self.get_object()
        if product.images.count() <= 1:
            return Response({'detail': 'A listing needs at least one photo.'}, status=status.HTTP_400_BAD_REQUEST)
        image = get_object_or_404(product.images, pk=image_id)
        was_primary = image.is_primary
        image.image.delete(save=False)
        image.delete()
        if was_primary:
            product.images.filter(pk=product.images.first().pk).update(is_primary=True)
        return self._respond(product)

    @extend_schema(request=None, responses=SellerProductSerializer)
    @action(detail=True, methods=['post'], url_path=r'images/(?P<image_id>\d+)/primary')
    def set_primary_image(self, request, pk=None, image_id=None):
        product = self.get_object()
        image = get_object_or_404(product.images, pk=image_id)
        product.images.update(is_primary=False)
        image.is_primary = True
        image.save(update_fields=['is_primary'])
        return self._respond(product)

    @extend_schema(responses=inline_serializer('SellerStats', {
        'total': serializers.IntegerField(), 'approved': serializers.IntegerField(),
        'pending': serializers.IntegerField(), 'rejected': serializers.IntegerField(),
        'hidden': serializers.IntegerField(), 'views': serializers.IntegerField(),
        'orders_pending': serializers.IntegerField(), 'sales_total': serializers.DecimalField(14, 2),
    }))
    @action(detail=False)
    def stats(self, request):
        from orders.models import Order

        products = Product.objects.filter(seller=request.user)
        counts = products.aggregate(
            total=Count('id'),
            approved=Count('id', filter=Q(status=Product.Status.APPROVED)),
            pending=Count('id', filter=Q(status=Product.Status.PENDING)),
            rejected=Count('id', filter=Q(status=Product.Status.REJECTED)),
            hidden=Count('id', filter=Q(is_active=False)),
            views=Sum('views_count'),
        )
        orders = Order.objects.filter(seller=request.user)
        return Response({
            **counts,
            'views': counts['views'] or 0,
            'orders_pending': orders.filter(status=Order.Status.PENDING).count(),
            'sales_total': orders.filter(status=Order.Status.DELIVERED).aggregate(s=Sum('total'))['s'] or 0,
        })


class SellerReviewListView(generics.ListAPIView):
    """Reviews received by a seller."""

    serializer_class = SellerReviewSerializer
    permission_classes = [AllowAny]
    queryset = SellerReview.objects.none()  # for the API schema

    def get_queryset(self):
        return SellerReview.objects.filter(seller_id=self.kwargs['seller_id']).select_related('reviewer')


class StatsView(APIView):
    """Headline numbers for the home page."""

    permission_classes = [AllowAny]

    @extend_schema(responses=inline_serializer('Stats', {
        'products': serializers.IntegerField(),
        'sellers': serializers.IntegerField(),
        'cities': serializers.IntegerField(),
        'categories': serializers.IntegerField(),
    }))
    def get(self, request):
        products = Product.objects.filter(PUBLIC_PRODUCTS)
        return Response({
            'products': products.count(),
            'sellers': products.values('seller').distinct().count(),
            'cities': products.values('city').distinct().count(),
            'categories': Category.objects.filter(is_active=True, parent__isnull=True).count(),
        })
