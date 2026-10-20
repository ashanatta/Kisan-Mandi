from drf_spectacular.utils import extend_schema_field, inline_serializer
from rest_framework import serializers

from accounts.models import phone_validator
from marketplace.models import Product
from marketplace.serializers import ProductListSerializer
from payments.gateways import method_mode
from payments.models import Dispute, DisputeEvidence

from .models import CartItem, Order, OrderItem, OrderStatusHistory
from .services import allowed_actions, can_open_dispute, qty, tracks_stock


class CartItemSerializer(serializers.ModelSerializer):
    product = ProductListSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), source='product', write_only=True
    )
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    available_quantity = serializers.DecimalField(
        source='product.quantity', max_digits=12, decimal_places=2, read_only=True
    )
    seller_name = serializers.CharField(source='product.seller.__str__', read_only=True)
    seller_id = serializers.IntegerField(source='product.seller_id', read_only=True)

    class Meta:
        model = CartItem
        fields = ('id', 'product', 'product_id', 'quantity', 'line_total', 'available_quantity',
                  'seller_id', 'seller_name', 'added_at')

    def validate(self, attrs):
        user = self.context['request'].user
        product = attrs.get('product') or self.instance.product
        quantity = attrs.get('quantity', getattr(self.instance, 'quantity', None))
        if not product.is_available:
            raise serializers.ValidationError({'product_id': 'This listing is not available.'})
        if product.seller_id == user.id:
            raise serializers.ValidationError({'product_id': 'You cannot buy your own listing.'})
        if tracks_stock(product) and quantity > product.quantity:
            raise serializers.ValidationError(
                {'quantity': f'Only {qty(product.quantity)} {product.get_unit_display()} available.'}
            )
        return attrs


class CheckoutSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(validators=[phone_validator])

    class Meta:
        model = Order
        fields = ('full_name', 'phone', 'address', 'city', 'district', 'notes', 'payment_method')

    def validate_payment_method(self, value):
        # Only online methods: the platform must receive the money to protect the buyer.
        if method_mode(value) is None:
            raise serializers.ValidationError('This payment method is not available.')
        return value


class OrderItemSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = ('id', 'product', 'product_title', 'unit', 'price', 'quantity', 'line_total', 'image')

    def get_image(self, item) -> str | None:
        if not item.product:
            return None
        images = list(item.product.images.all())
        if not images:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(images[0].image.url) if request else images[0].image.url


class StatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderStatusHistory
        fields = ('status', 'note', 'created_at')


class PartySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(source='__str__')
    phone = serializers.CharField()
    whatsapp = serializers.CharField()
    city = serializers.CharField()
    is_verified = serializers.BooleanField()


class EvidenceSerializer(serializers.ModelSerializer):
    by_buyer = serializers.SerializerMethodField()

    class Meta:
        model = DisputeEvidence
        fields = ('id', 'image', 'by_buyer', 'created_at')

    def get_by_buyer(self, evidence) -> bool:
        return evidence.uploaded_by_id == evidence.dispute.order.buyer_id


class DisputeSerializer(serializers.ModelSerializer):
    evidence = EvidenceSerializer(many=True, read_only=True)
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)
    decision_display = serializers.CharField(source='get_decision_display', read_only=True)

    class Meta:
        model = Dispute
        fields = ('reason', 'reason_display', 'description', 'seller_response', 'seller_responded_at',
                  'respond_by', 'status', 'decision', 'decision_display', 'refund_amount',
                  'resolution_note', 'resolved_at', 'evidence', 'created_at')


class MoneySerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    status = serializers.CharField()
    reference = serializers.CharField()


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    status_history = StatusHistorySerializer(many=True, read_only=True)
    buyer = serializers.SerializerMethodField()
    seller = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_method_display = serializers.CharField(source='get_payment_method_display', read_only=True)
    payment = serializers.SerializerMethodField()
    allowed_actions = serializers.SerializerMethodField()
    can_dispute = serializers.SerializerMethodField()
    release_at = serializers.DateTimeField(read_only=True)
    dispute = DisputeSerializer(read_only=True)
    refunds = serializers.SerializerMethodField()
    payout = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            'id', 'order_number', 'status', 'status_display', 'payment_method', 'payment_method_display',
            'payment', 'buyer', 'seller', 'full_name', 'phone', 'address', 'city', 'district', 'notes',
            'subtotal', 'delivery_charge', 'total', 'cancel_reason', 'items', 'status_history',
            'allowed_actions', 'can_dispute', 'paid_at', 'delivered_at', 'completed_at', 'release_at',
            'dispute', 'refunds', 'payout', 'created_at', 'updated_at',
        )

    def _party(self, user, order):
        data = PartySerializer(user).data
        # Contact details only after payment – keeps deals inside the protection.
        if not order.paid_at:
            data['phone'] = data['whatsapp'] = None
        return data

    @extend_schema_field(PartySerializer)
    def get_buyer(self, order):
        return self._party(order.buyer, order)

    @extend_schema_field(PartySerializer)
    def get_seller(self, order):
        return self._party(order.seller, order)

    @extend_schema_field(inline_serializer('OrderPayment', {
        'reference': serializers.CharField(), 'status': serializers.CharField(),
        'expires_at': serializers.DateTimeField(),
    }, allow_null=True))
    def get_payment(self, order):
        p = order.payment
        return {'reference': p.reference, 'status': p.status, 'expires_at': p.expires_at} if p else None

    def get_allowed_actions(self, order) -> list[str]:
        return allowed_actions(order, self.context['request'].user)

    def get_can_dispute(self, order) -> bool:
        return can_open_dispute(order, self.context['request'].user)

    @extend_schema_field(MoneySerializer(many=True))
    def get_refunds(self, order):
        return [{'amount': r.amount, 'status': r.status, 'reference': r.reference} for r in order.refunds.all()]

    @extend_schema_field(inline_serializer('OrderPayout', {
        'gross': serializers.DecimalField(14, 2), 'commission': serializers.DecimalField(14, 2),
        'net': serializers.DecimalField(14, 2), 'status': serializers.CharField(),
    }, allow_null=True))
    def get_payout(self, order):
        # Only the seller sees payout details
        payout = getattr(order, 'payout', None)
        if not payout or self.context['request'].user.id != order.seller_id:
            return None
        return {'gross': payout.gross, 'commission': payout.commission, 'net': payout.net, 'status': payout.status}


class DisputeOpenSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=Dispute.Reason.choices)
    description = serializers.CharField(max_length=2000)
    images = serializers.ListField(child=serializers.ImageField(), required=False, max_length=6)


class DisputeRespondSerializer(serializers.Serializer):
    response = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    images = serializers.ListField(child=serializers.ImageField(), required=False, max_length=6)


class StatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)
