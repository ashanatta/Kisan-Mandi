"""
Where the market data comes from:

- News: Google News RSS, free, no key needed.
- Urdu headlines and advice: Gemini (free key from https://aistudio.google.com/apikey).
- Prices and the market brief: Gemini with Google Search grounding, two searches a
  day, only with GEMINI_SEARCH on (needs billing on the Google project). Otherwise
  an admin types the prices in Django admin.

Everything is cached in the database; pages never wait for the internet.
Run `manage.py refresh_market` from cron, or let the market page trigger a
background refresh when the data is older than the refresh interval.
"""
import json
import logging
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from email.utils import parsedate_to_datetime

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.utils import timezone

from .models import CATALOG, MarketBrief, MarketPrice, NewsItem

log = logging.getLogger(__name__)

GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
# (lang, Google News query). Urdu search breaks on OR / when: and has few fresh
# farm stories, so it uses plain words and a longer window.
NEWS_FEEDS = [
    ('en', 'Pakistan (agriculture OR farmers OR wheat OR fertilizer OR cotton OR rice) when:7d'),
    ('ur', 'زرعی'),
    ('ur', 'کسان'),
    ('ur', 'زراعت'),
]
# A headline must mention farming to be kept (search results drift off-topic).
FARM_WORDS = re.compile(
    r'agri|farm|crop|wheat|rice|paddy|cotton|sugar|maize|corn|fertili[sz]|urea|\bdap\b|pesticide|seed|harvest|'
    r'sowing|rabi|kharif|livestock|cattle|dairy|milk|flour|mandi|kisan|irrigat|canal|tubewell|food secur|'
    r'کسان|زراع|زرعی|گندم|کپاس|کھاد|چاول|فصل|مویشی|دودھ|آٹا|بیج|منڈی|کاشت|آبپاشی|یوریا',
    re.IGNORECASE,
)
NEWS_PER_FEED = 30
NEWS_MAX_AGE_DAYS = {'en': 30, 'ur': 60}
USER_AGENT = 'Mozilla/5.0 (KisanMandi market bot)'


class SourceError(Exception):
    pass


# ---------- Gemini ----------

def ai_enabled():
    return bool(settings.GEMINI_API_KEY)


def search_enabled():
    return ai_enabled() and settings.GEMINI_SEARCH


def gemini(prompt, search=False, timeout=90):
    """Ask Gemini. Returns (text, sources) where sources are the web pages it searched."""
    if not ai_enabled():
        raise SourceError('GEMINI_API_KEY is not set.')
    body = {'contents': [{'role': 'user', 'parts': [{'text': prompt}]}]}
    if search:
        body['tools'] = [{'google_search': {}}]
    request = urllib.request.Request(
        GEMINI_URL.format(model=settings.GEMINI_MODEL),
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'x-goog-api-key': settings.GEMINI_API_KEY},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.load(response)
    except urllib.error.HTTPError as err:
        raise SourceError(f'Gemini error {err.code}: {err.read()[:300]!r}') from err
    except (urllib.error.URLError, TimeoutError, ValueError) as err:
        raise SourceError(f'Gemini unreachable: {err}') from err

    candidate = (data.get('candidates') or [{}])[0]
    text = ''.join(p.get('text', '') for p in candidate.get('content', {}).get('parts', []))
    if not text:
        raise SourceError(f'Gemini returned no text ({candidate.get("finishReason", "unknown")}).')
    chunks = candidate.get('groundingMetadata', {}).get('groundingChunks', [])
    sources = [{'title': c['web'].get('title', ''), 'url': c['web']['uri']} for c in chunks if c.get('web', {}).get('uri')]
    return text, sources


def parse_json(text):
    """Grounded answers can't use JSON mode, so pull the first {...} block out of the text."""
    text = re.sub(r'```(?:json)?', '', text)
    start, end = text.find('{'), text.rfind('}')
    if start < 0 or end < start:
        raise SourceError('No JSON in the answer.')
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError as err:
        raise SourceError(f'Bad JSON in the answer: {err}') from err


# ---------- Prices ----------

PAKISTAN_ITEMS = {
    'diesel': 'High-speed diesel, government notified price, Rs per litre',
    'urea': 'Urea fertilizer, market price, Rs per 50 kg bag',
    'dap': 'DAP fertilizer, market price, Rs per 50 kg bag',
    'labor': 'Unskilled farm labour daily wage in Punjab, Rs per day',
    'electricity': 'Agricultural tubewell electricity tariff, Rs per unit (kWh)',
    'wheat': 'Wheat, mandi / market rate, Rs per 40 kg (maund)',
    'rice': 'Basmati rice (Super Kernel), mandi rate, Rs per 40 kg',
    'cotton': 'Seed cotton (phutti), mandi rate, Rs per 40 kg',
    'sugarcane': 'Sugarcane, mill / support price, Rs per 40 kg',
    'maize': 'Maize, mandi rate, Rs per 40 kg',
    'potato': 'Potato, wholesale mandi rate, Rs per kg',
    'milk': 'Fresh milk, retail price in Punjab, Rs per litre',
    'cpi': 'Pakistan CPI inflation, latest yearly rate in percent (put the percent in "price", year_ago null)',
}
WORLD_ITEMS = {
    'intl_wheat': 'Wheat, international price (US HRW or Black Sea), US$ per ton',
    'intl_rice': 'Rice, Thai 5% broken, US$ per ton',
    'intl_cotton': 'Cotton, Cotlook A index, US cents per lb',
    'brent': 'Brent crude oil, US$ per barrel',
    'intl_urea': 'Urea, international (Middle East granular), US$ per ton',
}


def _price_prompt(items, today, extra=''):
    lines = '\n'.join(f'- "{key}": {desc}' for key, desc in items.items())
    return (
        f'Today is {today:%d %B %Y}. Use Google Search to find the LATEST value of each item below, and the value '
        f'about one year ago (around {today - timedelta(days=365):%B %Y}).\n{lines}\n\n'
        'Rules: numbers only (no commas, units or text); if you find a range use its middle; use null for anything '
        'you could not find – never guess. Add a short "note" with the date or place of the value.\n'
        f'{extra}'
        'Reply with ONLY this JSON:\n'
        '{"items": {"<key>": {"price": 0, "year_ago": 0, "note": ""}}'
        + (', "summary_en": "", "summary_ur": ""' if extra else '') + '}'
    )


def _number(value):
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return number if number.is_finite() and 0 < number < 10**9 else None


def save_prices(items):
    """Store sane values from the AI answer. Locked (admin) prices are never overwritten."""
    saved = 0
    known = {row[0] for row in CATALOG}
    for key, value in (items or {}).items():
        if key not in known or not isinstance(value, dict):
            continue
        if key == 'cpi':
            price = _number(value.get('price'))  # inflation can't be ≤ 0 here, which is fine for Pakistan
            year_ago = None
            if price is None or price > 100:
                continue
        else:
            price, year_ago = _number(value.get('price')), _number(value.get('year_ago'))
            if price is None:
                continue
            if year_ago and not Decimal('0.3') < price / year_ago < 3:
                year_ago = None  # implausible jump – likely a different unit
        current = MarketPrice.objects.filter(key=key).first()
        if current and current.locked:
            continue
        MarketPrice.objects.update_or_create(key=key, defaults=dict(
            price=price.quantize(Decimal('0.01')), year_ago=year_ago and year_ago.quantize(Decimal('0.01')),
            note=str(value.get('note') or '')[:255], source=MarketPrice.Source.AI,
        ))
        saved += 1
    return saved


def refresh_prices():
    today = timezone.localdate()
    text, pk_sources = gemini(_price_prompt(PAKISTAN_ITEMS, today), search=True)
    saved = save_prices(parse_json(text).get('items'))

    brief_extra = (
        'Also write "summary_en": 3–4 short, simple sentences on the international agriculture market situation that '
        'matters to Pakistani farmers right now (grain prices, fertilizer, oil, weather, export demand), and '
        '"summary_ur": the same in simple Urdu.\n'
    )
    text, world_sources = gemini(_price_prompt(WORLD_ITEMS, today, brief_extra), search=True)
    world = parse_json(text)
    saved += save_prices(world.get('items'))

    seen, sources = set(), []
    for s in pk_sources + world_sources:
        if s['url'] not in seen:
            seen.add(s['url'])
            sources.append(s)
    MarketBrief.objects.create(
        summary_en=str(world.get('summary_en') or '')[:2000], summary_ur=str(world.get('summary_ur') or '')[:2000],
        sources=sources[:20],
    )
    return saved


# ---------- News ----------

def _feed_url(lang, query):
    region = {'en': 'hl=en-PK&gl=PK&ceid=PK:en', 'ur': 'hl=ur&gl=PK&ceid=PK:ur'}[lang]
    return f'https://news.google.com/rss/search?q={urllib.parse.quote(query)}&{region}'


def parse_feed(xml_bytes, lang):
    items = []
    for node in ET.fromstring(xml_bytes).iter('item'):
        title, link = (node.findtext('title') or '').strip(), (node.findtext('link') or '').strip()
        if not title or not link:
            continue
        source = (node.findtext('source') or '').strip()
        if source and title.endswith(f' - {source}'):
            title = title[: -len(source) - 3]
        try:
            published = parsedate_to_datetime(node.findtext('pubDate'))
        except (TypeError, ValueError):
            published = None
        items.append(dict(title=title[:500], url=link[:1000], source=source[:150], lang=lang, published_at=published))
    return items


def refresh_news():
    added = 0
    cutoffs = {lang: timezone.now() - timedelta(days=days) for lang, days in NEWS_MAX_AGE_DAYS.items()}
    for lang, query in NEWS_FEEDS:
        cutoff = cutoffs[lang]
        request = urllib.request.Request(_feed_url(lang, query), headers={'User-Agent': USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                items = parse_feed(response.read(), lang)
        except (urllib.error.URLError, TimeoutError, ET.ParseError) as err:
            log.warning('News feed %r failed: %s', query, err)
            continue
        fresh = [i for i in items if i['published_at'] and i['published_at'] >= cutoff and FARM_WORDS.search(i['title'])]
        fresh.sort(key=lambda i: i['published_at'], reverse=True)
        for item in fresh[:NEWS_PER_FEED]:
            _, created = NewsItem.objects.get_or_create(url_hash=NewsItem.hash_url(item['url']), defaults=item)
            added += created
    for lang, cutoff in cutoffs.items():
        NewsItem.objects.filter(lang=lang, published_at__lt=cutoff).delete()
    return added


def translate_headlines(limit=15):
    """One Gemini call: Urdu titles for the newest English headlines (Urdu farm news is scarce)."""
    pending = list(NewsItem.objects.filter(lang=NewsItem.Lang.EN, title_ur='')[:limit])
    if not pending:
        return 0
    numbered = '\n'.join(f'{i}. {n.title}' for i, n in enumerate(pending, 1))
    text, _ = gemini(
        'Translate these Pakistani agriculture news headlines into simple, natural Urdu (Urdu script). '
        'Keep names and numbers. Reply with ONLY JSON: {"1": "...", "2": "..."}\n\n' + numbered
    )
    translations = parse_json(text)
    done = 0
    for i, item in enumerate(pending, 1):
        title = str(translations.get(str(i)) or '').strip()
        if title:
            NewsItem.objects.filter(pk=item.pk).update(title_ur=title[:500])
            done += 1
    return done


# ---------- Refresh ----------

def _older_than(moment, hours):
    return moment is None or moment < timezone.now() - timedelta(hours=hours)


def prices_stale():
    last = MarketBrief.objects.order_by('-created_at').values_list('created_at', flat=True).first()
    return _older_than(last, settings.MARKET_REFRESH_HOURS)


def news_stale():
    last = NewsItem.objects.order_by('-fetched_at').values_list('fetched_at', flat=True).first()
    return _older_than(last, settings.NEWS_REFRESH_HOURS)


def refresh(force=False):
    """Refresh whatever is stale. Returns a short report; failures are logged, not raised."""
    report = {}
    if force or news_stale():
        report['news_added'] = refresh_news()
        if ai_enabled():
            try:
                report['headlines_translated'] = translate_headlines()
            except SourceError as err:
                log.warning('Headline translation failed: %s', err)
    if search_enabled() and (force or prices_stale()):
        try:
            report['prices_saved'] = refresh_prices()
        except SourceError as err:
            log.warning('Price refresh failed: %s', err)
            report['prices_error'] = str(err)
    return report


def refresh_in_background():
    """Start one refresh thread if data is stale and none is running (a page view never waits for it)."""
    if not (news_stale() or (search_enabled() and prices_stale())):
        return False
    if not cache.add('insights:refreshing', True, timeout=15 * 60):
        return False

    def run():
        try:
            refresh()
        except Exception:  # noqa: BLE001 – a background job must never crash the server
            log.exception('Market refresh crashed')
        finally:
            cache.delete('insights:refreshing')
            connection.close()  # this thread's own DB connection

    threading.Thread(target=run, daemon=True, name='market-refresh').start()
    return True


def is_refreshing():
    return bool(cache.get('insights:refreshing'))
