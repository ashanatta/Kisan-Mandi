import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class CartItem(models.Model):
    """Server-side cart so it survives logout and works across devices."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='cart_items'
    )
    product = models.ForeignKey('marketplace.Product', on_delete=models.CASCADE, related_name='+')
    quantity = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))]
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-added_at']
        constraints = [
            models.UniqueConstraint(fields=['user', 'product'], name='unique_cart_product'),
        ]

    @property
    def line_total(self):
        return self.product.price * self.quantity

    def __str__(self):
        return f'{self.user} – {self.product} × {self.quantity}'


def generate_order_number():
    return 'AGR-' + uuid.uuid4().hex[:10].upper()


class Order(models.Model):
    """
    Checkout splits the cart into one order per seller, so each seller
    manages only their own orders and statuses.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        CONFIRMED = 'confirmed', 'Confirmed'
        SHIPPED = 'shipped', 'Shipped'
        DELIVERED = 'delivered', 'Delivered'
        CANCELLED = 'cancelled', 'Cancelled'

    class PaymentMethod(models.TextChoices):
        COD = 'cod', 'Cash on Delivery'
        BANK = 'bank_transfer', 'Bank Transfer'
        EASYPAISA = 'easypaisa', 'Easypaisa'
        JAZZCASH = 'jazzcash', 'JazzCash'

    # Allowed status changes; anything else is rejected by the API.
    ALLOWED_TRANSITIONS = {
        Status.PENDING: {Status.CONFIRMED, Status.CANCELLED},
        Status.CONFIRMED: {Status.SHIPPED, Status.CANCELLED},
        Status.SHIPPED: {Status.DELIVERED},
        Status.DELIVERED: set(),
        Status.CANCELLED: set(),
    }

    order_number = models.CharField(max_length=20, unique=True, default=generate_order_number, editable=False)
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='orders_placed'
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='orders_received'
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    payment_method = models.CharField(max_length=15, choices=PaymentMethod.choices, default=PaymentMethod.COD)

    # Shipping details (copied at checkout)
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=13)
    address = models.TextField()
    city = models.CharField(max_length=100)
    district = models.CharField(max_length=100)
    notes = models.TextField(blank=True)

    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0'))
    delivery_charge = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    total = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal('0'))

    cancel_reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['buyer', 'status']),
            models.Index(fields=['seller', 'status']),
        ]

    def can_transition_to(self, new_status):
        return new_status in self.ALLOWED_TRANSITIONS.get(self.status, set())

    def recalculate_totals(self):
        self.subtotal = sum((item.line_total for item in self.items.all()), Decimal('0'))
        self.total = self.subtotal + self.delivery_charge

    def __str__(self):
        return self.order_number


class OrderItem(models.Model):
    """Snapshot of the product at order time, so later edits don't change old orders."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(
        'marketplace.Product', on_delete=models.SET_NULL, null=True, blank=True, related_name='order_items'
    )
    product_title = models.CharField(max_length=200)
    unit = models.CharField(max_length=10)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))]
    )
    line_total = models.DecimalField(max_digits=14, decimal_places=2)

    def save(self, *args, **kwargs):
        self.line_total = self.price * self.quantity
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.product_title} × {self.quantity}'


class OrderStatusHistory(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='status_history')
    status = models.CharField(max_length=10, choices=Order.Status.choices)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        verbose_name_plural = 'order status history'

    def __str__(self):
        return f'{self.order} → {self.status}'
