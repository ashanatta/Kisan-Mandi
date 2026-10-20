"""
Order business logic with escrow (Kisan Mandi Protection).

Money flow: the buyer pays the platform → the money is held while the order is
pending/confirmed/shipped/delivered/disputed → it is released to the seller
(Payout) when the order completes, or returned to the buyer (Refund) when a paid
order is cancelled or a dispute is decided in the buyer's favour.
"""
from collections import defaultdict
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from marketplace.models import Category, Product
from payments.models import Dispute, DisputeEvidence, Payment, Payout, Refund
from tracker.models import Income

from .models import CartItem, Order, OrderItem, OrderStatusHistory

S = Order.Status

# Income source used when a completed sale is copied into the tracker.
INCOME_SOURCE_BY_KIND = {
    Category.Kind.CROP: Income.Source.CROP_SALE,
    Category.Kind.LIVESTOCK: Income.Source.ANIMAL_SALE,
}

# What each party may do through the API. Admin decisions on disputes and
# system events (payment received, auto-release) bypass these via system=True.
SELLER_ACTIONS = {
    S.PENDING: {S.CONFIRMED, S.CANCELLED},
    S.CONFIRMED: {S.SHIPPED, S.CANCELLED},
    S.SHIPPED: {S.DELIVERED},
}
BUYER_ACTIONS = {
    S.AWAITING_PAYMENT: {S.CANCELLED},
    S.PENDING: {S.CANCELLED},
    S.DELIVERED: {S.COMPLETED},  # "I received it – release the money"
}
DISPUTE_OPEN_STATUSES = (S.SHIPPED, S.DELIVERED)
MAX_EVIDENCE = 6


def tracks_stock(product):
    """Rentals are booked per acre/day/hour, so their quantity is not limited by stock."""
    return product.listing_type != Product.ListingType.RENT


def qty(value):
    """Decimal without trailing zeros: 20.00 → '20', 2.50 → '2.5'."""
    return f'{value.normalize():f}'


def money(value):
    return Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def has_paid_order(buyer, seller):
    """True once the buyer has paid for an order from this seller (unlocks contact details)."""
    if not buyer or not buyer.is_authenticated:
        return False
    return Order.objects.filter(buyer=buyer, seller=seller, paid_at__isnull=False).exists()


# ---------- Checkout ----------

@transaction.atomic
def checkout(user, shipping, method):
    """Turn the cart into one order per seller, reserve stock and create one payment for all of them."""
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

    payment = Payment.objects.create(buyer=user, method=method, amount=0)
    orders = []
    for seller_id, lines in by_seller.items():
        order = Order.objects.create(
            buyer=user, seller_id=seller_id, payment=payment, payment_method=method, **shipping
        )
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
        OrderStatusHistory.objects.create(order=order, status=order.status, changed_by=user, note='Order placed – waiting for payment')
        orders.append(order)

    payment.amount = sum((o.total for o in orders), Decimal('0'))
    payment.save(update_fields=['amount'])
    CartItem.objects.filter(user=user).delete()
    return payment, orders


# ---------- Status changes ----------

def allowed_actions(order, user):
    """Statuses this user may move the order to next through the API."""
    if user.id == order.seller_id:
        return sorted(SELLER_ACTIONS.get(order.status, set()))
    if user.id == order.buyer_id:
        return sorted(BUYER_ACTIONS.get(order.status, set()))
    return []


def can_open_dispute(order, user):
    return user.id == order.buyer_id and order.status in DISPUTE_OPEN_STATUSES and not hasattr(order, 'dispute')


@transaction.atomic
def change_status(order, new_status, user, note='', system=False):
    """
    Move an order to `new_status` with all money side effects.
    `system=True` is for payments, auto-release and admin dispute decisions.
    """
    order = Order.objects.select_for_update().get(pk=order.pk)
    if not order.can_transition_to(new_status):
        raise ValidationError({'status': f'Cannot change a {order.status} order to {new_status}.'})
    if not system and new_status not in allowed_actions(order, user):
        raise PermissionDenied('You are not allowed to make this change.')

    now = timezone.now()
    order.status = new_status
    if new_status == S.PENDING:
        order.paid_at = now
    elif new_status == S.DELIVERED:
        order.delivered_at = now
    elif new_status == S.CANCELLED:
        order.cancel_reason = note
        _restore_stock(order)
        if order.paid_at:
            Refund.objects.create(order=order, amount=order.total, reason=note or 'Order cancelled')
    elif new_status == S.COMPLETED:
        order.completed_at = now
        _release_to_seller(order)
        record_sales_income(order)

    order.save()
    OrderStatusHistory.objects.create(order=order, status=new_status, changed_by=user, note=note)
    return order


def _restore_stock(order):
    for item in order.items.exclude(product=None).select_related('product'):
        if tracks_stock(item.product):
            Product.objects.filter(pk=item.product_id).update(quantity=F('quantity') + item.quantity)


def _release_to_seller(order):
    """Create the seller's payout: total minus any partial refund, minus platform commission."""
    refunded = order.refunds.aggregate(s=Sum('amount'))['s'] or Decimal('0')
    gross = money(order.total - refunded)
    commission = money(gross * Decimal(str(settings.PLATFORM_COMMISSION_PERCENT)) / 100)
    Payout.objects.get_or_create(
        order=order,
        defaults=dict(seller_id=order.seller_id, gross=gross, commission=commission, net=gross - commission),
    )


def record_sales_income(order):
    """Copy completed items into the seller's linked tracker business as income."""
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


# ---------- Disputes ----------

def _add_evidence(dispute, user, images):
    if dispute.evidence.count() + len(images) > MAX_EVIDENCE:
        raise ValidationError({'images': f'You can attach at most {MAX_EVIDENCE} photos.'})
    for image in images:
        DisputeEvidence.objects.create(dispute=dispute, uploaded_by=user, image=image)


@transaction.atomic
def open_dispute(order, user, reason, description, images=()):
    if not can_open_dispute(order, user):
        raise ValidationError({'detail': 'You can report a problem only after the order is shipped and before it is completed.'})
    dispute = Dispute.objects.create(
        order=order, reason=reason, description=description,
        respond_by=timezone.now() + timedelta(hours=settings.SELLER_RESPONSE_HOURS),
    )
    _add_evidence(dispute, user, images)
    change_status(order, S.DISPUTED, user, note=f'Buyer reported: {dispute.get_reason_display()}', system=True)
    return dispute


@transaction.atomic
def respond_to_dispute(order, user, response, images=()):
    dispute = getattr(order, 'dispute', None)
    if not dispute or dispute.status != Dispute.Status.OPEN:
        raise ValidationError({'detail': 'There is no open dispute on this order.'})
    if user.id == order.seller_id:
        dispute.seller_response = response
        dispute.seller_responded_at = timezone.now()
        dispute.save(update_fields=['seller_response', 'seller_responded_at'])
    elif user.id != order.buyer_id:
        raise PermissionDenied()
    _add_evidence(dispute, user, images)
    return dispute


@transaction.atomic
def resolve_dispute(dispute, decision, admin_user, refund_amount=None, note=''):
    """An admin's final decision. Moves the money and, if the seller was at fault, gives a strike."""
    from accounts.penalties import give_strike

    D = Dispute.Decision
    order = dispute.order
    if dispute.status != Dispute.Status.OPEN or order.status != S.DISPUTED:
        raise ValidationError('This dispute is already resolved.')

    if decision in (D.REFUND_FULL, D.FRAUD):
        Refund.objects.create(order=order, amount=order.total, reason=f'Dispute decided for buyer: {dispute.get_reason_display()}')
        change_status(order, S.REFUNDED, admin_user, note=note or 'Full refund to buyer', system=True)
        give_strike(order.seller, f'Lost dispute on {order.order_number}: {dispute.get_reason_display()}',
                    order=order, fraud=decision == D.FRAUD)
    elif decision == D.REFUND_PARTIAL:
        amount = money(refund_amount or 0)
        if not Decimal('0') < amount < order.total:
            raise ValidationError({'refund_amount': f'Enter an amount between 1 and {order.total}.'})
        Refund.objects.create(order=order, amount=amount, reason='Partial refund after dispute')
        change_status(order, S.COMPLETED, admin_user, note=note or f'Partial refund Rs {amount}', system=True)
    elif decision == D.RELEASE:
        change_status(order, S.COMPLETED, admin_user, note=note or 'Dispute rejected – money released to seller', system=True)
    else:
        raise ValidationError({'decision': 'Choose a decision.'})

    dispute.decision, dispute.refund_amount, dispute.resolution_note = decision, refund_amount, note
    dispute.status, dispute.resolved_at, dispute.resolved_by = Dispute.Status.RESOLVED, timezone.now(), admin_user
    dispute.save()
    return dispute


# ---------- Time-based jobs ----------

def run_due_tasks():
    """
    Expire unpaid checkouts and auto-release money for delivered orders whose
    protection window passed without a dispute. Cheap enough to run on every
    orders request; also available as `manage.py process_escrow` for cron.
    """
    from payments.services import fail_payment

    now = timezone.now()
    for payment in Payment.objects.filter(status=Payment.Status.PENDING, expires_at__lt=now):
        fail_payment(payment, Payment.Status.EXPIRED, 'Payment time ran out')

    cutoff = now - timedelta(days=settings.PROTECTION_DAYS)
    for order in Order.objects.filter(status=S.DELIVERED, delivered_at__lt=cutoff):
        change_status(order, S.COMPLETED, None, note='No problem reported – money released automatically', system=True)


def cart_summary(items):
    subtotal = sum((item.line_total for item in items), Decimal('0'))
    return {'count': len(items), 'subtotal': subtotal, 'sellers': len({i.product.seller_id for i in items})}
