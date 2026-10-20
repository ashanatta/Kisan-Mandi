"""
Payment gateways.

- JazzCash hosted checkout ("page redirection", API v1.1): the browser posts a signed
  form to JazzCash; JazzCash posts the result back to JAZZCASH_RETURN_URL.
  Built from JazzCash's documented format; must be tested with sandbox credentials.
- Test gateway: when PAYMENT_TEST_MODE is on, buyers can simulate success/failure.
- Bank transfer: manual – the buyer uploads a receipt and an admin confirms it.
"""
import hashlib
import hmac
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

JAZZCASH_URLS = {
    True: 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
    False: 'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
}
JAZZCASH_SUCCESS = '000'


def jazzcash_configured():
    return bool(settings.JAZZCASH_MERCHANT_ID and settings.JAZZCASH_PASSWORD and settings.JAZZCASH_INTEGRITY_SALT)


def bank_configured():
    return bool(settings.PLATFORM_BANK_ACCOUNT_NUMBER)


def method_mode(method):
    """'live' / 'sandbox' (real gateway), 'test' (simulated), 'manual' (bank) or None (unavailable)."""
    if method == 'jazzcash':
        if jazzcash_configured():
            return 'sandbox' if settings.JAZZCASH_SANDBOX else 'live'
        return 'test' if settings.PAYMENT_TEST_MODE else None
    if method == 'easypaisa':
        # No Easypaisa integration yet – only the simulator in test mode.
        return 'test' if settings.PAYMENT_TEST_MODE else None
    if method == 'bank_transfer':
        return 'manual' if bank_configured() else None
    return None


def available_methods():
    return [{'key': key, 'mode': method_mode(key), 'enabled': method_mode(key) is not None}
            for key in ('jazzcash', 'easypaisa', 'bank_transfer')]


def bank_details():
    return {
        'bank_name': settings.PLATFORM_BANK_NAME,
        'account_title': settings.PLATFORM_BANK_ACCOUNT_TITLE,
        'account_number': settings.PLATFORM_BANK_ACCOUNT_NUMBER,
    }


# ---------- JazzCash ----------

def _jazzcash_hash(fields):
    """HMAC-SHA256 over the integrity salt and the non-empty pp_* values sorted by key."""
    salt = settings.JAZZCASH_INTEGRITY_SALT
    values = [str(fields[k]) for k in sorted(fields) if k.startswith('pp_') and k != 'pp_SecureHash' and str(fields[k]) != '']
    message = '&'.join([salt, *values])
    return hmac.new(salt.encode(), message.encode(), hashlib.sha256).hexdigest().upper()


def jazzcash_form(payment):
    """Fields for the auto-submitted form that sends the buyer to JazzCash."""
    now = timezone.localtime()
    fields = {
        'pp_Version': '1.1',
        'pp_TxnType': '',  # empty: buyer chooses wallet or card on the JazzCash page
        'pp_Language': 'EN',
        'pp_MerchantID': settings.JAZZCASH_MERCHANT_ID,
        'pp_SubMerchantID': '',
        'pp_Password': settings.JAZZCASH_PASSWORD,
        'pp_BankID': '',
        'pp_ProductID': '',
        'pp_TxnRefNo': payment.reference.replace('-', ''),
        'pp_Amount': str(int(payment.amount * 100)),  # in paisa
        'pp_TxnCurrency': 'PKR',
        'pp_TxnDateTime': now.strftime('%Y%m%d%H%M%S'),
        'pp_BillReference': payment.reference.replace('-', ''),
        'pp_Description': f'Kisan Mandi order {payment.reference}',
        'pp_TxnExpiryDateTime': (now + timedelta(minutes=settings.PAYMENT_EXPIRY_MINUTES)).strftime('%Y%m%d%H%M%S'),
        'pp_ReturnURL': settings.JAZZCASH_RETURN_URL,
        'ppmpf_1': payment.reference,
    }
    fields['pp_SecureHash'] = _jazzcash_hash(fields)
    return {'url': JAZZCASH_URLS[settings.JAZZCASH_SANDBOX], 'fields': fields}


def verify_jazzcash_response(data):
    """Returns (is_authentic, is_success). Never trust a response whose hash doesn't match."""
    received = data.get('pp_SecureHash', '')
    authentic = bool(received) and hmac.compare_digest(received.upper(), _jazzcash_hash(data))
    return authentic, data.get('pp_ResponseCode') == JAZZCASH_SUCCESS
