from rest_framework import serializers

from .models import Payment, Payout


class PaymentOrderSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    order_number = serializers.CharField()
    seller_name = serializers.CharField(source='seller.__str__')
    total = serializers.DecimalField(max_digits=14, decimal_places=2)
    status = serializers.CharField()


class PaymentSerializer(serializers.ModelSerializer):
    orders = PaymentOrderSerializer(many=True, read_only=True)
    method_display = serializers.CharField(source='get_method_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Payment
        fields = ('reference', 'method', 'method_display', 'amount', 'status', 'status_display',
                  'gateway', 'failure_reason', 'bank_txn_id', 'expires_at', 'paid_at', 'created_at', 'orders')


class BankReceiptSerializer(serializers.Serializer):
    bank_txn_id = serializers.CharField(max_length=100)
    receipt = serializers.ImageField()

    def validate_receipt(self, value):
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError('Receipt photo must be smaller than 5 MB.')
        return value


class TestResultSerializer(serializers.Serializer):
    result = serializers.ChoiceField(choices=['success', 'fail'])


class PayoutSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True)

    class Meta:
        model = Payout
        fields = ('order_number', 'gross', 'commission', 'net', 'status', 'reference', 'paid_at', 'created_at')
