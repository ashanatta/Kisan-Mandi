from decimal import Decimal, InvalidOperation

from django.db.models import Prefetch, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from marketplace.models import ProductImage

from . import services
from .models import CartItem, Order, OrderItem
from .serializers import (
    CartItemSerializer,
    CheckoutSerializer,
    DeliverSerializer,
    DisputeOpenSerializer,
    DisputeRespondSerializer,
    OrderSerializer,
    StatusUpdateSerializer,
)

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
    Sellers only see orders that have been paid – the money is then held by the platform.
    """

    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    queryset = Order.objects.none()  # for the API schema
    filterset_fields = ('status',)
    search_fields = ('order_number', 'items__product_title', 'full_name')
    ordering_fields = ('created_at', 'total')
    ordering = ('-created_at',)

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        services.run_due_tasks()  # expire unpaid checkouts, auto-release protected money

    def get_queryset(self):
        user = self.request.user
        seller_view = Q(seller=user, paid_at__isnull=False)
        if self.action in ('list', 'counts'):
            # Lists are either "orders I placed" or "orders I received".
            mine = seller_view if self.request.query_params.get('as') == 'seller' else Q(buyer=user)
        else:
            # Detail and actions: either party may open the order.
            mine = Q(buyer=user) | seller_view
        return Order.objects.filter(mine).select_related('buyer', 'seller', 'payment', 'dispute', 'payout').prefetch_related(
            Prefetch('items', queryset=OrderItem.objects.select_related('product').prefetch_related(
                Prefetch('product__images', queryset=ProductImage.objects.all())
            )),
            'status_history', 'refunds', 'dispute__evidence',
        )

    @extend_schema(parameters=[OpenApiParameter('as', enum=['buyer', 'seller'], required=False)])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(request=CheckoutSerializer, responses={201: inline_serializer('CheckoutResult', {
        'payment_reference': serializers.CharField(),
        'orders': OrderSerializer(many=True),
    })})
    @action(detail=False, methods=['post'])
    def checkout(self, request):
        """Create the orders and one payment. The buyer is then sent to /pay/<reference>."""
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        method = data.pop('payment_method')
        payment, orders = services.checkout(request.user, data, method)
        fresh = self.get_queryset().filter(pk__in=[o.pk for o in orders])
        return Response(
            {'payment_reference': payment.reference, 'orders': self.get_serializer(fresh, many=True).data},
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(request={'multipart/form-data': DisputeOpenSerializer}, responses=OrderSerializer)
    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def dispute(self, request, pk=None):
        """Buyer reports a problem. The money stays held until an admin decides."""
        serializer = DisputeOpenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        order = self.get_object()
        services.open_dispute(order, request.user, data['reason'], data['description'], data.get('images', []))
        return Response(self.get_serializer(self.get_queryset().get(pk=order.pk)).data)

    @extend_schema(request={'multipart/form-data': DisputeRespondSerializer}, responses=OrderSerializer)
    @action(detail=True, methods=['post'], url_path='dispute/respond', parser_classes=[MultiPartParser, FormParser])
    def dispute_respond(self, request, pk=None):
        """Seller answers a dispute (or either party adds more photos)."""
        serializer = DisputeRespondSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        order = self.get_object()
        services.respond_to_dispute(order, request.user, data.get('response', ''), data.get('images', []))
        return Response(self.get_serializer(self.get_queryset().get(pk=order.pk)).data)

    @extend_schema(request={'multipart/form-data': DeliverSerializer}, responses=OrderSerializer)
    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def deliver(self, request, pk=None):
        """Seller marks the order delivered with the buyer's code, or with a proof photo."""
        serializer = DeliverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        order = services.mark_delivered(
            self.get_object(), request.user, code=data.get('code', ''), proof=data.get('proof'),
            courier_name=data.get('courier_name', ''), tracking_number=data.get('tracking_number', ''),
        )
        return Response(self.get_serializer(self.get_queryset().get(pk=order.pk)).data)

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
            'received': by_status(Order.objects.filter(seller=request.user, paid_at__isnull=False)),
        })
