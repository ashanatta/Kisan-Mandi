from datetime import date
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from tracker.models import Business, Expense, Income

from . import sources
from .forecast import build_forecast
from .models import ForecastAdvice, MarketBrief, MarketPrice, NewsItem

User = get_user_model()
TODAY = date(2026, 10, 21)

RSS = b"""<?xml version="1.0"?><rss><channel>
<item><title>Urea price rises before Rabi sowing - Dawn</title><link>https://example.com/a</link>
<pubDate>Tue, 20 Oct 2026 08:00:00 GMT</pubDate><source url="https://dawn.com">Dawn</source></item>
<item><title>No link here</title></item>
</channel></rss>"""


def make_farm(user):
    farm = Business.objects.create(owner=user, name='Wheat Crop 2025-26', start_date=date(2025, 11, 1), area_acres=10)
    # Base window is Oct 2025 – Sep 2026.
    Expense.objects.create(business=farm, category='fuel', amount=Decimal('100000'), date=date(2025, 11, 10))
    Expense.objects.create(business=farm, category='fertilizer', amount=Decimal('200000'), date=date(2025, 12, 5))
    Expense.objects.create(business=farm, category='labor', amount=Decimal('50000'), date=date(2026, 4, 15))
    Income.objects.create(business=farm, source='crop_sale', amount=Decimal('600000'), date=date(2026, 5, 1))
    # Outside the window: too old, and the current month.
    Expense.objects.create(business=farm, category='fuel', amount=Decimal('999'), date=date(2025, 9, 30))
    Income.objects.create(business=farm, source='crop_sale', amount=Decimal('999'), date=date(2026, 10, 2))
    return farm


@override_settings(FORECAST_FALLBACK_INFLATION='6')
class ForecastTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('farmer', 'f@example.com', 'pass12345!')
        self.farm = make_farm(self.user)

    def test_uses_last_twelve_complete_months(self):
        f = build_forecast(self.user, today=TODAY)
        self.assertEqual(f['base']['expense'], Decimal('350000'))
        self.assertEqual(f['base']['income'], Decimal('600000'))
        self.assertEqual(f['period']['next_start'], date(2026, 10, 1))
        self.assertEqual([m['month'] for m in f['by_month']], ['2026-11', '2026-12', '2027-04', '2027-05'])
        self.assertTrue(f['enough_data'])
        self.assertEqual(f['crops'], ['wheat'])

    def test_lines_follow_their_market_prices(self):
        MarketPrice.objects.create(key='diesel', price=Decimal('300'), year_ago=Decimal('250'))  # +20%
        MarketPrice.objects.create(key='urea', price=Decimal('4400'), year_ago=Decimal('4000'))  # +10%
        MarketPrice.objects.create(key='dap', price=Decimal('12000'), year_ago=Decimal('12000'))  # 0%
        MarketPrice.objects.create(key='wheat', price=Decimal('3600'), year_ago=Decimal('4000'))  # -10%
        MarketPrice.objects.create(key='cpi', price=Decimal('5'))
        f = build_forecast(self.user, today=TODAY)
        lines = {line['key']: line for line in f['expense_lines'] + f['income_lines']}
        self.assertEqual(lines['fuel']['next'], Decimal('120000'))
        self.assertEqual(lines['fertilizer']['next'], Decimal('210000'))  # average of urea and DAP
        self.assertEqual(lines['labor']['drivers'], ['cpi'])  # no labour price → inflation
        self.assertEqual(lines['labor']['next'], Decimal('52500'))
        self.assertEqual(lines['crop_sale']['next'], Decimal('540000'))
        self.assertEqual(f['expected']['profit'], Decimal('540000') - Decimal('382500'))
        self.assertLess(f['bad']['profit'], f['expected']['profit'])
        self.assertGreater(f['good']['profit'], f['expected']['profit'])
        self.assertFalse(f['inflation_assumed'])

    def test_crazy_price_jumps_are_capped(self):
        MarketPrice.objects.create(key='diesel', price=Decimal('1000'), year_ago=Decimal('100'))
        lines = {line['key']: line for line in build_forecast(self.user, today=TODAY)['expense_lines']}
        self.assertEqual(lines['fuel']['change_pct'], 100.0)

    def test_other_users_data_is_not_used(self):
        other = User.objects.create_user('other', 'o@example.com', 'pass12345!')
        f = build_forecast(other, today=TODAY)
        self.assertEqual(f['base']['income'], 0)
        self.assertFalse(f['enough_data'])


class SourceTests(TestCase):
    def test_save_prices_keeps_sane_values_and_locked_rows(self):
        MarketPrice.objects.create(key='urea', price=Decimal('4500'), locked=True)
        saved = sources.save_prices({
            'diesel': {'price': '280.5', 'year_ago': 255, 'note': 'OGRA 16 Oct'},
            'urea': {'price': 9999},  # locked by admin
            'dap': {'price': 12000, 'year_ago': 1200},  # 10x jump: wrong unit, drop year_ago
            'wheat': {'price': None},
            'cpi': {'price': 4.5},
            'made_up': {'price': 1},
        })
        self.assertEqual(saved, 3)
        self.assertEqual(MarketPrice.objects.get(key='urea').price, Decimal('4500'))
        self.assertIsNone(MarketPrice.objects.get(key='dap').year_ago)
        diesel = MarketPrice.objects.get(key='diesel')
        self.assertEqual(diesel.source, MarketPrice.Source.AI)
        self.assertAlmostEqual(float(diesel.change), 0.1, places=2)
        self.assertFalse(MarketPrice.objects.filter(key='wheat').exists())

    def test_parse_json_from_fenced_answer(self):
        self.assertEqual(sources.parse_json('Here:\n```json\n{"items": {"a": 1}}\n```'), {'items': {'a': 1}})
        with self.assertRaises(sources.SourceError):
            sources.parse_json('sorry, no data')

    def test_parse_feed(self):
        items = sources.parse_feed(RSS, 'en')
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['title'], 'Urea price rises before Rabi sowing')
        self.assertEqual(items[0]['source'], 'Dawn')

    @override_settings(GEMINI_API_KEY='test-key')
    def test_refresh_prices_stores_prices_brief_and_sources(self):
        answers = [
            ('{"items": {"diesel": {"price": 280, "year_ago": 260, "note": ""}}}',
             [{'title': 'OGRA', 'url': 'https://ogra.org.pk'}]),
            ('{"items": {"brent": {"price": 70, "year_ago": 80}}, "summary_en": "Calm.", "summary_ur": "پرسکون"}',
             [{'title': 'OGRA', 'url': 'https://ogra.org.pk'}, {'title': 'WB', 'url': 'https://worldbank.org'}]),
        ]
        with mock.patch.object(sources, 'gemini', side_effect=answers) as fake:
            self.assertEqual(sources.refresh_prices(), 2)
        self.assertTrue(all(call.kwargs['search'] for call in fake.call_args_list))
        brief = MarketBrief.objects.get()
        self.assertEqual(brief.summary_ur, 'پرسکون')
        self.assertEqual(len(brief.sources), 2)  # duplicates removed

    @override_settings(GEMINI_API_KEY='')
    def test_without_key_only_news_is_refreshed(self):
        with mock.patch.object(sources, 'refresh_news', return_value=5), \
                mock.patch.object(sources, 'refresh_prices') as prices:
            self.assertEqual(sources.refresh(force=True), {'news_added': 5})
        prices.assert_not_called()

    @override_settings(GEMINI_API_KEY='test-key', GEMINI_SEARCH=False)
    def test_free_key_translates_but_does_not_search_prices(self):
        with mock.patch.object(sources, 'refresh_news', return_value=5), \
                mock.patch.object(sources, 'translate_headlines', return_value=3), \
                mock.patch.object(sources, 'refresh_prices') as prices:
            self.assertEqual(sources.refresh(force=True), {'news_added': 5, 'headlines_translated': 3})
        prices.assert_not_called()


@override_settings(GEMINI_API_KEY='test-key')
class ApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('farmer', 'f@example.com', 'pass12345!')
        self.farm = make_farm(self.user)
        NewsItem.objects.create(title='Wheat news', title_ur='گندم کی خبر', url='https://example.com/n', lang='en')

    def test_market_is_public_and_mixes_translated_news_into_urdu(self):
        with mock.patch.object(sources, 'refresh_in_background'):
            data = self.client.get('/api/insights/market/').data
        self.assertEqual(data['news']['ur'][0]['title'], 'گندم کی خبر')
        self.assertEqual(data['news']['en'][0]['title'], 'Wheat news')

    def test_forecast_needs_login_and_own_business(self):
        self.assertEqual(self.client.get('/api/insights/forecast/').status_code, 401)
        other = User.objects.create_user('other', 'o@example.com', 'pass12345!')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f'/api/insights/forecast/?business={self.farm.pk}').status_code, 400)

    def test_advice_is_cached_for_the_day(self):
        self.client.force_authenticate(self.user)
        with mock.patch('insights.advice.gemini', return_value=('- Buy urea early.', [])) as fake, \
                mock.patch('insights.forecast.timezone.localdate', return_value=TODAY):
            first = self.client.get(f'/api/insights/forecast/advice/?business={self.farm.pk}&lang=ur')
            second = self.client.get(f'/api/insights/forecast/advice/?business={self.farm.pk}&lang=ur')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(first.data['text'], '- Buy urea early.')
        self.assertTrue(second.data['cached'])
        self.assertEqual(fake.call_count, 1)
        self.assertEqual(ForecastAdvice.objects.count(), 1)
        prompt = fake.call_args.args[0]
        self.assertNotIn('Wheat Crop 2025-26', prompt)  # business names are never sent
        self.assertIn('Urdu', prompt)
