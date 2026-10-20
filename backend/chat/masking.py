"""
Before a buyer has paid, contact details in messages are hidden so deals stay
inside Kisan Mandi Protection (most scams start with "pay me directly").
"""
import re

HIDDEN = '[🔒 hidden until payment]'

# Phone numbers: 03001234567, 0300-1234567, +92 300 1234567 … (checked for >= 10 digits below,
# so prices and quantities like "20 40 60 80" are left alone)
PHONE = re.compile(r'(?:\+|00)?\d[\d\s\-().]{8,}\d')

PATTERNS = [
    # Links and wa.me / WhatsApp invites
    re.compile(r'(?:https?://|www\.)\S+|wa\.me/\S*|chat\.whatsapp\.com/\S*', re.IGNORECASE),
    # Email addresses
    re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+'),
    # IBAN / long account numbers
    re.compile(r'\bPK\d{2}[A-Z0-9 ]{10,}\b', re.IGNORECASE),
]


def mask_contact_details(text):
    """Returns (masked_text, was_masked)."""
    # Links/emails first: a wa.me link contains a phone number and must be removed whole.
    masked = text
    for pattern in PATTERNS:
        masked = pattern.sub(HIDDEN, masked)
    masked = PHONE.sub(lambda m: HIDDEN if sum(c.isdigit() for c in m.group()) >= 10 else m.group(), masked)
    return masked, masked != text
