from decimal import Decimal, InvalidOperation

from django.db.models import Prefetch, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from marketplace.models import ProductImage

from . import services
from .models import CartItem, Order, OrderItem
from .serializers import CartItemSerializer, CheckoutSerializer, OrderSerializer, StatusUpdateSerializer

CartResponse = inline_serializer('Cart', {
    'items': CartItemSerializer(many=True),
    'count': serializers.IntegerField(),
    'subtotal': serializers.DecimalField(14, 2),
    'sellers': serializers.IntegerField(),
})


class CartViewSet(mixins.CreateModelMixin, mixins.UpdateModelMixin, mixins.DestroyModelMixin,
                  viewsets.GenericViewSet):
    """
    The logged-in user's cart. `GET /cart/` returns items with totals.
    Adding a product that is already in the cart increases its quantity.
    """

    serializer_class = CartItemSerializer
    permission_classes = [IsAuthenticated]
    queryset = CartItem.objects.none()  # for the API schema
    pagination_class = None

    def get_queryset(self):
        return (
            CartItem.objects.filter(user=self.request.user)
            .select_related('product__category', 'product__seller')
            .prefetch_related('product__images')
        )

    def _cart(self):
        items = list(self.get_queryset())
        data = CartItemSerializer(items, many=True, context=self.get_serializer_context()).data
        return Response({'items': data, **services.cart_summary(items)})

    @extend_schema(responses=CartResponse)
    def list(self, request):
        return self._cart()

    @extend_schema(responses=CartResponse)
    def create(self, request, *args, **kwargs):
        existing = self.get_queryset().filter(product_id=request.data.get('product_id')).first()
        if existing:
            try:
                quantity = existing.quantity + Decimal(str(request.data.get('quantity', 1)))
            except InvalidOperation:
                return Response({'quantity': ['Enter a valid number.']}, status=status.HTTP_400_BAD_REQUEST)
            serializer = self.get_serializer(existing, data={'quantity': quantity}, partial=True)
        else:
            serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return self._cart()

    @extend_schema(responses=CartResponse)
    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        return self._cart()

    @extend_schema(responses=CartResponse)
    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return self._cart()

    @extend_schema(request=None, responses=CartResponse)
    @action(detail=False, methods=['delete'])
    def clear(self, request):
        self.get_queryset().delete()
        return self._cart()


class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Orders the user placed (default) or received as a seller (`?as=seller`).
    """

    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    queryset = Order.objects.none()  # for the API schema
    filterset_fields = ('status',)
    search_fields = ('order_number', 'items__product_title', 'full_name')
    ordering_fields = ('created_at', 'total')
    ordering = ('-created_at',)

    def get_queryset(self):
        user = self.request.user
        if self.action == 'list':
            # Lists are either "orders I placed" or "orders I received".
            mine = Q(seller=user) if self.request.query_params.get('as') == 'seller' else Q(buyer=user)
        else:
            # Detail and actions: either party may open the order.
            mine = Q(buyer=user) | Q(seller=user)
        return Order.objects.filter(mine).select_related('buyer', 'seller').prefetch_related(
            Prefetch('items', queryset=OrderItem.objects.select_related('product').prefetch_related(
                Prefetch('product__images', queryset=ProductImage.objects.all())
            )),
            'status_history',
        )

    @extend_schema(parameters=[OpenApiParameter('as', enum=['buyer', 'seller'], required=False)])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request=CheckoutSerializer, responses={201: OrderSerializer(many=True)})
    @action(detail=False, methods=['post'])
    def checkout(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        orders = services.checkout(request.user, serializer.validated_data)
        fresh = self.get_queryset().filter(pk__in=[o.pk for o in orders])
        return Response(self.get_serializer(fresh, many=True).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=StatusUpdateSerializer, responses=OrderSerializer)
    @action(detail=True, methods=['post'])
    def status(self, request, pk=None):
        serializer = StatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = services.change_status(
            self.get_object(), serializer.validated_data['status'], request.user,
            serializer.validated_data.get('note', ''),
        )
        return Response(self.get_serializer(self.get_queryset().get(pk=order.pk)).data)

    @extend_schema(responses=inline_serializer('OrderCounts', {
        'placed': serializers.DictField(child=serializers.IntegerField()),
        'received': serializers.DictField(child=serializers.IntegerField()),
    }))
    @action(detail=False)
    def counts(self, request):
        """Order counts by status, for badges."""
        def by_status(qs):
            out = {s: 0 for s, _ in Order.Status.choices}
            for row in qs.values_list('status', flat=True):
                out[row] += 1
            return out

        return Response({
            'placed': by_status(Order.objects.filter(buyer=request.user)),
            'received': by_status(Order.objects.filter(seller=request.user)),
        })
