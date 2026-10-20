from rest_framework import serializers

from .models import Business, Expense, Income


class BusinessSerializer(serializers.ModelSerializer):
    total_income = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_expense = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    profit = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    business_type_display = serializers.CharField(source='get_business_type_display', read_only=True)
    season_display = serializers.CharField(source='get_season_display', read_only=True)

    class Meta:
        model = Business
        fields = (
            'id', 'name', 'business_type', 'business_type_display', 'season', 'season_display',
            'description', 'area_acres', 'start_date', 'end_date', 'is_active',
            'total_income', 'total_expense', 'profit', 'created_at',
        )

    def validate_name(self, value):
        owner = self.context['request'].user
        qs = Business.objects.filter(owner=owner, name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('You already have a business with this name.')
        return value

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError({'end_date': 'End date cannot be before start date.'})
        return attrs


class OwnedBusinessField(serializers.PrimaryKeyRelatedField):
    """Only lets users pick their own businesses."""

    def get_queryset(self):
        return Business.objects.filter(owner=self.context['request'].user)


class ExpenseSerializer(serializers.ModelSerializer):
    business = OwnedBusinessField()
    business_name = serializers.CharField(source='business.name', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = Expense
        fields = ('id', 'business', 'business_name', 'category', 'category_display', 'amount', 'date', 'notes', 'created_at')


class IncomeSerializer(serializers.ModelSerializer):
    business = OwnedBusinessField()
    business_name = serializers.CharField(source='business.name', read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    from_marketplace = serializers.SerializerMethodField()

    class Meta:
        model = Income
        fields = ('id', 'business', 'business_name', 'source', 'source_display', 'amount', 'quantity', 'unit',
                  'date', 'notes', 'from_marketplace', 'created_at')

    def get_from_marketplace(self, obj) -> bool:
        return obj.order_item_id is not None
