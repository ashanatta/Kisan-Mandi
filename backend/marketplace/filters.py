import django_filters
from django.db.models import Q

from .models import Category, Product


class ProductFilter(django_filters.FilterSet):
    category = django_filters.CharFilter(method='filter_category', help_text='Category slug (includes sub-categories).')
    kind = django_filters.ChoiceFilter(field_name='category__kind', choices=Category.Kind.choices)
    min_price = django_filters.NumberFilter(field_name='price', lookup_expr='gte')
    max_price = django_filters.NumberFilter(field_name='price', lookup_expr='lte')
    city = django_filters.CharFilter(field_name='city', lookup_expr='iexact')
    district = django_filters.CharFilter(field_name='district', lookup_expr='iexact')
    seller = django_filters.NumberFilter(field_name='seller_id')

    class Meta:
        model = Product
        fields = ('category', 'kind', 'min_price', 'max_price', 'city', 'district',
                  'condition', 'listing_type', 'unit', 'seller')

    def filter_category(self, queryset, name, value):
        return queryset.filter(Q(category__slug=value) | Q(category__parent__slug=value))
