"""Order business logic: checkout and status changes."""
from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.models import Category, Product
from tracker.models import Income

from .models import CartItem, Order, OrderItem, OrderStatusHistory

# Income source used when a delivered sale is copied into the tracker.
INCOME_SOURCE_BY_KIND = {
    Category.Kind.CROP: Income.Source.CROP_SALE,
    Category.Kind.LIVESTOCK: Income.Source.ANIMAL_SALE,
}


def tracks_stock(product):
    """Rentals are booked per acre/day/hour, so their quantity is not limited by stock."""
    return product.listing_type != Product.ListingType.RENT


def qty(value):
    """Decimal without trailing zeros: 20.00 → '20', 2.50 → '2.5'."""
    return f'{value.normalize():f}'


@transaction.atomic
def checkout(user, shipping):
    """Turn the user's cart into one order per seller and reserve stock."""
    cart = list(CartItem.objects.filter(user=user).select_related('product__seller'))
    if not cart:
        raise ValidationError({'detail': 'Your cart is empty.'})

    # Lock the products so two buyers can't buy the same last item.
    products = Product.objects.select_for_update().in_bulk([item.product_id for item in cart])
    errors = []
    by_seller = defaultdict(list)
    for item in cart:
        product = products[item.product_id]
        if not product.is_available:
            errors.append(f'"{product.title}" is no longer available.')
        elif tracks_stock(product) and item.quantity > product.quantity:
            errors.append(f'Only {qty(product.quantity)} {product.unit} of "{product.title}" left.')
        else:
            by_seller[product.seller_id].append((item, product))
    if errors:
        raise ValidationError({'detail': ' '.join(errors)})

    orders = []
    for seller_id, lines in by_seller.items():
        order = Order.objects.create(buyer=user, seller_id=seller_id, **shipping)
        for item, product in lines:
            OrderItem.objects.create(
                order=order, product=product, product_title=product.title,
                # Rentals are priced per acre/day/hour, so that is the unit of the quantity.
                unit=product.unit if tracks_stock(product) else product.rent_period,
                price=product.price, quantity=item.quantity,
            )
            if tracks_stock(product):
                Product.objects.filter(pk=product.pk).update(quantity=F('quantity') - item.quantity)
        order.recalculate_totals()
        order.save(update_fields=['subtotal', 'total'])
        OrderStatusHistory.objects.create(order=order, status=order.status, changed_by=user, note='Order placed')
        orders.append(order)

    CartItem.objects.filter(user=user).delete()
    return orders


def allowed_actions(order, user):
    """Statuses this user may move the order to next."""
    if user.id == order.seller_id or user.is_platform_admin:
        return sorted(order.ALLOWED_TRANSITIONS[order.status])
    if user.id == order.buyer_id and order.status == Order.Status.PENDING:
        return [Order.Status.CANCELLED]
    return []


@transaction.atomic
def change_status(order, new_status, user, note=''):
    order = Order.objects.select_for_update().get(pk=order.pk)
    if new_status not in allowed_actions(order, user):
        if not order.can_transition_to(new_status):
            raise ValidationError({'status': f'Cannot change a {order.status} order to {new_status}.'})
        raise PermissionDenied('You are not allowed to make this change.')

    order.status = new_status
    if new_status == Order.Status.CANCELLED:
        order.cancel_reason = note
        for item in order.items.exclude(product=None).select_related('product'):
            if tracks_stock(item.product):
                Product.objects.filter(pk=item.product_id).update(quantity=F('quantity') + item.quantity)
    order.save(update_fields=['status', 'cancel_reason', 'updated_at'])
    OrderStatusHistory.objects.create(order=order, status=new_status, changed_by=user, note=note)

    if new_status == Order.Status.DELIVERED:
        record_sales_income(order)
    return order


def record_sales_income(order):
    """Copy delivered items into the seller's linked tracker business as income."""
    items = order.items.select_related('product__linked_business', 'product__category')
    for item in items:
        product = item.product
        if not product or not product.linked_business_id:
            continue
        Income.objects.get_or_create(
            order_item=item,
            defaults=dict(
                business=product.linked_business,
                source=INCOME_SOURCE_BY_KIND.get(product.category.kind, Income.Source.MARKETPLACE),
                amount=item.line_total,
                quantity=item.quantity,
                unit=item.unit,
                date=timezone.localdate(),
                notes=f'Marketplace order {order.order_number}',
            ),
        )


def cart_summary(items):
    subtotal = sum((item.line_total for item in items), Decimal('0'))
    return {'count': len(items), 'subtotal': subtotal, 'sellers': len({i.product.seller_id for i in items})}
