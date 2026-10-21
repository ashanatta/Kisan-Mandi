from django.contrib import admin
from django.utils.html import format_html

from .models import CartItem, Order, OrderItem, OrderStatusHistory


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('product', 'product_title', 'unit', 'price', 'quantity', 'line_total')


class OrderStatusHistoryInline(admin.TabularInline):
    model = OrderStatusHistory
    extra = 0
    readonly_fields = ('status', 'changed_by', 'note', 'created_at')


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('order_number', 'buyer', 'seller', 'status', 'delivery_verified', 'payment_method', 'total', 'created_at')
    list_filter = ('status', 'payment_method', 'delivery_verified')
    search_fields = ('order_number', 'buyer__username', 'seller__username', 'phone', 'tracking_number')
    list_select_related = ('buyer', 'seller')
    readonly_fields = ('order_number', 'subtotal', 'total', 'delivery_verified', 'delivery_code_attempts',
                       'courier_name', 'tracking_number', 'proof_preview', 'created_at', 'updated_at')
    exclude = ('delivery_proof',)
    inlines = [OrderItemInline, OrderStatusHistoryInline]

    @admin.display(description='Delivery proof')
    def proof_preview(self, obj):
        return delivery_proof_html(obj)


def delivery_proof_html(order):
    if not order.delivery_proof:
        return '—'
    return format_html('<a href="{0}" target="_blank"><img src="{0}" style="max-width:360px;border-radius:8px"></a>',
                       order.delivery_proof.url)


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ('user', 'product', 'quantity', 'added_at')
