"""
Market data for the farm forecast: today's prices (fetched daily by Gemini with
Google Search, or typed in by an admin), a short market brief, agriculture news
from RSS, and the AI advice cached per business per day.
"""
import hashlib

from django.conf import settings
from django.db import models

# key, English name, Urdu name, group, unit
CATALOG = [
    ('diesel', 'Diesel', 'ڈیزل', 'input', 'Rs/litre'),
    ('urea', 'Urea (50 kg bag)', 'یوریا (50 کلو بوری)', 'input', 'Rs/bag'),
    ('dap', 'DAP (50 kg bag)', 'ڈی اے پی (50 کلو بوری)', 'input', 'Rs/bag'),
    ('labor', 'Farm labour (daily wage)', 'مزدوری (دیہاڑی)', 'input', 'Rs/day'),
    ('electricity', 'Electricity (tubewell, per unit)', 'بجلی (ٹیوب ویل، فی یونٹ)', 'input', 'Rs/unit'),
    ('wheat', 'Wheat', 'گندم', 'mandi', 'Rs/40 kg'),
    ('rice', 'Rice (Basmati)', 'چاول (باسمتی)', 'mandi', 'Rs/40 kg'),
    ('cotton', 'Cotton (phutti)', 'کپاس (پھٹی)', 'mandi', 'Rs/40 kg'),
    ('sugarcane', 'Sugarcane', 'گنا', 'mandi', 'Rs/40 kg'),
    ('maize', 'Maize', 'مکئی', 'mandi', 'Rs/40 kg'),
    ('potato', 'Potato', 'آلو', 'mandi', 'Rs/kg'),
    ('milk', 'Milk', 'دودھ', 'mandi', 'Rs/litre'),
    ('intl_wheat', 'Wheat (world)', 'گندم (عالمی)', 'world', 'US$/ton'),
    ('intl_rice', 'Rice (world, Thai 5%)', 'چاول (عالمی)', 'world', 'US$/ton'),
    ('intl_cotton', 'Cotton (world, Cotlook A)', 'کپاس (عالمی)', 'world', 'US¢/lb'),
    ('brent', 'Crude oil (Brent)', 'خام تیل (برینٹ)', 'world', 'US$/barrel'),
    ('intl_urea', 'Urea (world)', 'یوریا (عالمی)', 'world', 'US$/ton'),
    ('cpi', 'Pakistan inflation (yearly)', 'مہنگائی کی سالانہ شرح', 'economy', '%'),
]
CATALOG_BY_KEY = {row[0]: row for row in CATALOG}


class MarketPrice(models.Model):
    """The latest known price of one item. For `cpi` the price is the inflation rate in %."""

    class Source(models.TextChoices):
        AI = 'ai', 'Gemini + Google Search'
        ADMIN = 'admin', 'Entered by admin'

    key = models.CharField(max_length=20, unique=True, choices=[(k, name) for k, name, *_ in CATALOG])
    price = models.DecimalField(max_digits=14, decimal_places=2)
    year_ago = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True,
                                   help_text='Price about one year ago, used for the yearly change')
    note = models.CharField(max_length=255, blank=True)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.ADMIN)
    locked = models.BooleanField(default=False, help_text='Keep this value: the daily AI refresh will not change it')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']

    @property
    def change(self):
        """Yearly change as a fraction (0.12 = +12%), or None when unknown."""
        if self.key == 'cpi':
            return self.price / 100
        if self.year_ago:
            return self.price / self.year_ago - 1
        return None

    def __str__(self):
        return f'{self.get_key_display()}: {self.price}'


class MarketBrief(models.Model):
    """One refresh: a short summary of market conditions and the web pages it came from."""

    summary_en = models.TextField(blank=True)
    summary_ur = models.TextField(blank=True)
    sources = models.JSONField(default=list, blank=True, help_text='[{"title", "url"}]')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        get_latest_by = 'created_at'

    def __str__(self):
        return f'Market brief {self.created_at:%Y-%m-%d %H:%M}'


class NewsItem(models.Model):
    class Lang(models.TextChoices):
        EN = 'en', 'English'
        UR = 'ur', 'Urdu'

    title = models.CharField(max_length=500)
    title_ur = models.CharField(max_length=500, blank=True, help_text='Urdu translation of an English headline')
    url = models.URLField(max_length=1000)
    url_hash = models.CharField(max_length=64, unique=True, editable=False)  # MySQL can't index long URLs
    source = models.CharField(max_length=150, blank=True)
    lang = models.CharField(max_length=2, choices=Lang.choices, default=Lang.EN)
    published_at = models.DateTimeField(null=True, blank=True)
    fetched_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-published_at']

    @staticmethod
    def hash_url(url):
        return hashlib.sha256(url.encode()).hexdigest()

    def save(self, *args, **kwargs):
        self.url_hash = self.hash_url(self.url)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class ForecastAdvice(models.Model):
    """Gemini's advice on a forecast, cached for the day so each farmer costs at most one call."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    business = models.ForeignKey('tracker.Business', on_delete=models.CASCADE, null=True, blank=True, related_name='+')
    lang = models.CharField(max_length=2)
    date = models.DateField()
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['user', 'date'])]
