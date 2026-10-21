from django.contrib import admin
from django.utils.html import format_html, format_html_join

from .models import MarketBrief, MarketPrice, NewsItem


@admin.register(MarketPrice)
class MarketPriceAdmin(admin.ModelAdmin):
    """Fix a wrong AI price here and tick "locked" so the daily refresh keeps your value."""

    list_display = ('key', 'price', 'year_ago', 'yearly_change', 'source', 'locked', 'note', 'updated_at')
    list_editable = ('price', 'year_ago', 'locked')
    list_filter = ('source', 'locked')
    readonly_fields = ('source', 'updated_at')

    @admin.display(description='Change')
    def yearly_change(self, obj):
        change = obj.change
        return '—' if change is None or obj.key == 'cpi' else f'{change * 100:+.1f}%'

    def save_model(self, request, obj, form, change):
        obj.source = MarketPrice.Source.ADMIN
        super().save_model(request, obj, form, change)


@admin.register(MarketBrief)
class MarketBriefAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'summary_en')
    readonly_fields = ('created_at', 'source_links')
    fields = ('summary_en', 'summary_ur', 'source_links', 'created_at')

    @admin.display(description='Sources')
    def source_links(self, obj):
        return format_html_join(format_html('<br>'), '<a href="{}" target="_blank">{}</a>',
                                ((s['url'], s.get('title') or s['url']) for s in obj.sources)) or '—'


@admin.register(NewsItem)
class NewsItemAdmin(admin.ModelAdmin):
    list_display = ('title', 'source', 'lang', 'published_at', 'link')
    list_filter = ('lang', 'source')
    search_fields = ('title',)

    def link(self, obj):
        return format_html('<a href="{}" target="_blank">open</a>', obj.url)
