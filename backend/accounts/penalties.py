"""Strikes, suspensions and bans for sellers who lose disputes."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import BannedCNIC, SellerStrike, SellerVerification

SUSPENSION_DAYS = 30
STRIKES_FOR_SUSPENSION = 2
STRIKES_FOR_BAN = 3


@transaction.atomic
def give_strike(seller, reason, order=None, fraud=False):
    """
    1st strike: warning. 2nd: 30-day suspension. 3rd (or proven fraud): permanent ban.
    Returns the action taken: 'warning', 'suspended' or 'banned'.
    """
    SellerStrike.objects.create(seller=seller, order=order, reason=reason)
    count = seller.strikes.count()
    if fraud or count >= STRIKES_FOR_BAN:
        ban(seller, reason)
        return 'banned'
    if count >= STRIKES_FOR_SUSPENSION:
        seller.suspended_until = timezone.now() + timedelta(days=SUSPENSION_DAYS)
        seller.save(update_fields=['suspended_until'])
        return 'suspended'
    return 'warning'


@transaction.atomic
def ban(seller, reason):
    """Block the account and the CNIC, and refund buyers whose paid orders were not shipped yet."""
    from orders.models import Order
    from orders.services import change_status

    seller.is_banned = True
    seller.is_verified = False
    seller.is_active = False  # can no longer log in
    seller.save(update_fields=['is_banned', 'is_verified', 'is_active'])

    verification = SellerVerification.objects.filter(user=seller).first()
    if verification:
        BannedCNIC.objects.get_or_create(cnic_number=verification.cnic_number, defaults={'user': seller, 'reason': reason})

    for order in Order.objects.filter(seller=seller, status__in=[Order.Status.PENDING, Order.Status.CONFIRMED]):
        change_status(order, Order.Status.CANCELLED, None, note='Seller banned – full refund', system=True)


def is_cnic_banned(cnic_number):
    return BannedCNIC.objects.filter(cnic_number=cnic_number).exists()
