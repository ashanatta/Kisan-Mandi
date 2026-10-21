"""
Next-year forecast for the expense tracker.

The farmer's last 12 months are the base. Each expense category and income
source is scaled by the yearly price change of what drives it (diesel for fuel,
urea/DAP for fertilizer, the mandi rate of the crop for crop sales, inflation for
the rest). Good and bad scenarios widen that around the expected case, because
weather and mandi swings matter more than any formula.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from tracker.models import Business, Expense, Income

from .models import MarketPrice

ZERO = Decimal('0')
MAX_UP, MAX_DOWN = Decimal('1.0'), Decimal('-0.5')  # ignore crazier yearly changes

# What drives the price of each expense / income line (market price keys)
EXPENSE_DRIVERS = {
    'fuel': ['diesel'],
    'fertilizer': ['urea', 'dap'],
    'labor': ['labor'],
    'electricity': ['electricity'],
    'irrigation': ['electricity', 'diesel'],
    'machinery_rent': ['diesel'],
    'transport': ['diesel'],
    'feed': ['maize'],  # feed mills follow the maize price
    'seed': None,  # follows the farm's own crops, see build_forecast
}
INCOME_DRIVERS = {
    'milk_sale': ['milk'],
    'machinery_rent': ['diesel'],
    'subsidy': [],  # no automatic change
}
CROP_INCOME = ('crop_sale', 'marketplace', 'fruit_veg_sale')
# Words in a business name that tell us the crop (English, Roman Urdu, Urdu)
CROP_WORDS = {
    'wheat': ('wheat', 'gandum', 'گندم'),
    'rice': ('rice', 'chawal', 'basmati', 'paddy', 'dhan', 'چاول', 'دھان'),
    'cotton': ('cotton', 'kapas', 'phutti', 'کپاس'),
    'sugarcane': ('sugarcane', 'cane', 'ganna', 'گنا', 'گنے'),
    'maize': ('maize', 'corn', 'makai', 'مکئی'),
    'potato': ('potato', 'aloo', 'آلو'),
}
DEFAULT_CROPS = ['wheat', 'rice', 'cotton', 'maize']

# Scenario spread around the expected case
GOOD = {'income': Decimal('0.10'), 'expense': Decimal('-0.05')}
BAD = {'income': Decimal('-0.15'), 'expense': Decimal('0.10')}


def detect_crops(businesses):
    found = []
    for business in businesses:
        name = business.name.lower()
        for crop, words in CROP_WORDS.items():
            if crop not in found and any(w in name for w in words):
                found.append(crop)
    if not found and any(b.business_type == Business.BusinessType.VEGETABLE for b in businesses):
        found.append('potato')
    return found


def price_changes():
    """{key: yearly change as a fraction} for every price we know the change of."""
    changes = {}
    for price in MarketPrice.objects.all():
        change = price.change
        if change is not None:
            changes[price.key] = max(MAX_DOWN, min(MAX_UP, change))
    return changes


def _change_for(drivers, changes, inflation):
    """Average change of the drivers we have data for; inflation when we have none."""
    known = [changes[k] for k in drivers if k in changes]
    if known:
        return sum(known) / len(known), [k for k in drivers if k in changes]
    return inflation, ['cpi']


def _money(value):
    return value.quantize(Decimal('1'))


def _lines(rows, drivers_for, changes, inflation):
    lines = []
    for key, base in rows:
        drivers = drivers_for(key)
        if drivers == []:
            change, used = ZERO, []
        else:
            change, used = _change_for(drivers, changes, inflation)
        nxt = base * (1 + change)
        lines.append({'key': key, 'base': _money(base), 'change_pct': round(float(change) * 100, 1),
                      'next': _money(nxt), 'delta': _money(nxt - base), 'drivers': used})
    return sorted(lines, key=lambda line: -line['base'])


def _scenario(income, expense, spread):
    income, expense = income * (1 + spread['income']), expense * (1 + spread['expense'])
    return {'income': _money(income), 'expense': _money(expense), 'profit': _money(income - expense)}


def build_forecast(user, business_id=None, today=None):
    today = today or timezone.localdate()
    businesses = Business.objects.filter(owner=user)
    if business_id:
        businesses = businesses.filter(pk=business_id)
    businesses = list(businesses)

    # Base: the last 12 complete months. Forecast: this month and the 11 after it.
    this_month = today.replace(day=1)
    base_start = this_month.replace(year=this_month.year - 1)
    next_end = this_month.replace(year=this_month.year + 1) - timedelta(days=1)
    expenses = Expense.objects.filter(business__in=businesses, date__gte=base_start, date__lt=this_month)
    incomes = Income.objects.filter(business__in=businesses, date__gte=base_start, date__lt=this_month)

    expense_rows = [(r['category'], r['s']) for r in expenses.values('category').annotate(s=Sum('amount'))]
    income_rows = [(r['source'], r['s']) for r in incomes.values('source').annotate(s=Sum('amount'))]

    changes = price_changes()
    fallback = Decimal(str(settings.FORECAST_FALLBACK_INFLATION)) / 100
    inflation = changes.get('cpi', fallback)
    crops = detect_crops(businesses)

    def income_drivers(source):
        if source in CROP_INCOME:
            return crops or DEFAULT_CROPS
        return INCOME_DRIVERS.get(source, ['cpi'])

    def expense_drivers(category):
        drivers = EXPENSE_DRIVERS.get(category, ['cpi'])
        return drivers if drivers is not None else (crops or DEFAULT_CROPS)

    expense_lines = _lines(expense_rows, expense_drivers, changes, inflation)
    income_lines = _lines(income_rows, income_drivers, changes, inflation)

    base_income = sum((line['base'] for line in income_lines), ZERO)
    base_expense = sum((line['base'] for line in expense_lines), ZERO)
    next_income = sum((line['next'] for line in income_lines), ZERO)
    next_expense = sum((line['next'] for line in expense_lines), ZERO)

    # Same seasonal pattern as last year, moved one year ahead and scaled.
    income_factor = next_income / base_income if base_income else Decimal('1')
    expense_factor = next_expense / base_expense if base_expense else Decimal('1')
    months = {}
    for qs, kind in ((incomes, 'income'), (expenses, 'expense')):
        for row in qs.annotate(m=TruncMonth('date')).values('m').annotate(s=Sum('amount')):
            month = row['m']
            key = date(month.year + 1, month.month, 1).strftime('%Y-%m')
            months.setdefault(key, {'income': ZERO, 'expense': ZERO})[kind] += row['s']
    by_month = []
    for key in sorted(months):
        inc = _money(months[key]['income'] * income_factor)
        exp = _money(months[key]['expense'] * expense_factor)
        by_month.append({'month': key, 'income': inc, 'expense': exp, 'profit': inc - exp})

    data_months = len({m['month'] for m in by_month})
    prices = MarketPrice.objects.order_by('-updated_at').values_list('updated_at', flat=True).first()
    return {
        'businesses': [{'id': b.id, 'name': b.name, 'type': b.business_type, 'season': b.season,
                        'area_acres': b.area_acres} for b in businesses],
        'crops': crops,
        'period': {'base_start': base_start, 'base_end': this_month - timedelta(days=1),
                   'next_start': this_month, 'next_end': next_end},
        'data_months': data_months,
        'enough_data': data_months >= 3,
        'base': {'income': base_income, 'expense': base_expense, 'profit': base_income - base_expense},
        'expected': {'income': next_income, 'expense': next_expense, 'profit': next_income - next_expense},
        'good': _scenario(next_income, next_expense, GOOD),
        'bad': _scenario(next_income, next_expense, BAD),
        'expense_lines': expense_lines,
        'income_lines': income_lines,
        'by_month': by_month,
        'inflation_pct': round(float(inflation) * 100, 1),
        'inflation_assumed': 'cpi' not in changes,
        'prices_updated_at': prices,
    }
