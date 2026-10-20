from rest_framework import serializers

from accounts.models import phone_validator
from marketplace.models import Product
from marketplace.serializers import ProductListSerializer

from .models import CartItem, Order, OrderItem, OrderStatusHistory
from .services import allowed_actions, qty, tracks_stock


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


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    status_history = StatusHistorySerializer(many=True, read_only=True)
    buyer = PartySerializer(read_only=True)
    seller = PartySerializer(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_method_display = serializers.CharField(source='get_payment_method_display', read_only=True)
    allowed_actions = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = (
            'id', 'order_number', 'status', 'status_display', 'payment_method', 'payment_method_display',
            'buyer', 'seller', 'full_name', 'phone', 'address', 'city', 'district', 'notes',
            'subtotal', 'delivery_charge', 'total', 'cancel_reason', 'items', 'status_history',
            'allowed_actions', 'created_at', 'updated_at',
        )

    def get_allowed_actions(self, order) -> list[str]:
        return allowed_actions(order, self.context['request'].user)


class StatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Order.Status.choices)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)
