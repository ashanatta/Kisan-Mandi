from django.db import transaction
from django.utils import timezone

from orders.models import CartItem, Order
from orders.services import change_status

from .models import Payment


@transaction.atomic
def mark_paid(payment, gateway='', txn_id='', response=None):
    """Money received: hold it in escrow and send the orders to the sellers."""
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.status == Payment.Status.PAID:
        return payment
    if payment.status not in (Payment.Status.PENDING, Payment.Status.VERIFYING):
        # Paid after it expired – keep the record so an admin can refund it.
        payment.gateway_response = {**payment.gateway_response, 'late_payment': response or {}}
        payment.save(update_fields=['gateway_response'])
        return payment
    payment.status, payment.paid_at = Payment.Status.PAID, timezone.now()
    payment.gateway = gateway or payment.gateway
    payment.gateway_txn_id = txn_id or payment.gateway_txn_id
    if response:
        payment.gateway_response = response
    payment.save()
    for order in payment.orders.filter(status=Order.Status.AWAITING_PAYMENT):
        change_status(order, Order.Status.PENDING, payment.buyer, note=f'Payment received ({payment.get_method_display()}) – money held by Kisan Mandi', system=True)
    return payment


@transaction.atomic
def fail_payment(payment, status=Payment.Status.FAILED, reason='', response=None):
    """Payment failed or expired: cancel the unpaid orders and release reserved stock."""
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.status == Payment.Status.PAID:
        return payment
    payment.status, payment.failure_reason = status, reason
    if response:
        payment.gateway_response = response
    payment.save()
    for order in payment.orders.filter(status=Order.Status.AWAITING_PAYMENT):
        change_status(order, Order.Status.CANCELLED, None, note=reason or 'Payment not completed', system=True)
        # Put the items back in the cart so the buyer can simply try again.
        for item in order.items.exclude(product=None):
            CartItem.objects.get_or_create(user=payment.buyer, product_id=item.product_id, defaults={'quantity': item.quantity})
    return payment
