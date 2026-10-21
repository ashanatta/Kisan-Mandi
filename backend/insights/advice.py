"""
Plain-language advice on a forecast from Gemini (no search needed: we hand it the
numbers, today's prices and the headlines). Only figures and the farm type are
sent – never names, phone numbers or business names. Cached for the day.
"""
from django.utils import timezone

from tracker.models import Expense, Income

from .models import CATALOG_BY_KEY, ForecastAdvice, MarketBrief, MarketPrice, NewsItem
from .sources import gemini

LANGS = {'en': 'simple English', 'ur': 'simple Urdu (Urdu script)'}


def _rs(value):
    return f'Rs {value:,.0f}'


def _prompt(forecast, lang):
    farms = '; '.join(
        f"{b['type']} ({b['season']}{', ' + str(b['area_acres']) + ' acres' if b['area_acres'] else ''})"
        for b in forecast['businesses']
    ) or 'not given'
    cats, sources = dict(Expense.Category.choices), dict(Income.Source.choices)

    def basis(line):
        if line['drivers'] == ['cpi']:
            return 'assumed general inflation, real price unknown' if forecast['inflation_assumed'] else 'inflation'
        return 'price of ' + ' + '.join(line['drivers']) if line['drivers'] else 'kept the same'

    lines = [f"- cost {cats[l['key']]}: last year {_rs(l['base'])}, change {l['change_pct']:+}% ({basis(l)}) → {_rs(l['next'])}"
             for l in forecast['expense_lines']]
    lines += [f"- income {sources[l['key']]}: last year {_rs(l['base'])}, change {l['change_pct']:+}% ({basis(l)}) → {_rs(l['next'])}"
              for l in forecast['income_lines']]
    prices = []
    for p in MarketPrice.objects.all():
        name, unit = CATALOG_BY_KEY[p.key][1], CATALOG_BY_KEY[p.key][4]
        change = f', {p.change * 100:+.0f}% in a year' if p.change is not None and p.key != 'cpi' else ''
        prices.append(f'- {name}: {p.price:,.0f} {unit}{change}')
    brief = MarketBrief.objects.first()
    news = NewsItem.objects.filter(lang='en').values_list('title', flat=True)[:8]
    e, b, g = forecast['expected'], forecast['bad'], forecast['good']

    return f"""You advise a small Pakistani farmer using the Kisan Mandi expense tracker.
Farm: {farms}. Crops detected: {', '.join(forecast['crops']) or 'unknown'}.
Months of records in the last year: {forecast['data_months']}.

Last 12 months: income {_rs(forecast['base']['income'])}, costs {_rs(forecast['base']['expense'])}, profit {_rs(forecast['base']['profit'])}.
Next 12 months forecast (expected): income {_rs(e['income'])}, costs {_rs(e['expense'])}, profit {_rs(e['profit'])}.
Bad case profit {_rs(b['profit'])}, good case profit {_rs(g['profit'])}.
Lines:
{chr(10).join(lines) or '- none'}

Today's market prices:
{chr(10).join(prices) or '- not available'}
Inflation used: {forecast['inflation_pct']}%.
World market: {brief.summary_en if brief else 'not available'}
Recent headlines:
{chr(10).join('- ' + t for t in news) or '- none'}

Write in {LANGS[lang]}, for a farmer with little schooling:
1. One sentence: will next year likely be profit or loss, and roughly how much.
2. The 2–3 biggest reasons (which cost or price moves the result most).
3. 3–4 practical actions to protect profit (when to buy inputs, when to sell, what to watch).
Use short "- " bullet points, under 180 words, no tables, no markdown headings.
Do not promise results; say it is an estimate. Do not invent prices that are not given above.
Where a change is only "assumed general inflation", do not say that price actually rose."""


def get_advice(user, forecast, business=None, lang='en'):
    """Today's advice for this user / business / language: from the cache, or one Gemini call."""
    today = timezone.localdate()
    cached = ForecastAdvice.objects.filter(user=user, business=business, lang=lang, date=today).first()
    if cached:
        return cached.text, True
    text, _ = gemini(_prompt(forecast, lang))
    ForecastAdvice.objects.create(user=user, business=business, lang=lang, date=today, text=text.strip()[:5000])
    ForecastAdvice.objects.filter(date__lt=today).delete()
    return text.strip(), False
