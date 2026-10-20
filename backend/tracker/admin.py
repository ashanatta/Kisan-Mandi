from django.contrib import admin

from .models import Business, Expense, Income


class ExpenseInline(admin.TabularInline):
    model = Expense
    extra = 0


class IncomeInline(admin.TabularInline):
    model = Income
    extra = 0


@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'business_type', 'season', 'start_date', 'end_date', 'is_active')
    list_filter = ('business_type', 'season', 'is_active')
    search_fields = ('name', 'owner__username')
    inlines = [ExpenseInline, IncomeInline]


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ('business', 'category', 'amount', 'date')
    list_filter = ('category',)
    date_hierarchy = 'date'


@admin.register(Income)
class IncomeAdmin(admin.ModelAdmin):
    list_display = ('business', 'source', 'amount', 'date', 'order_item')
    list_filter = ('source',)
    date_hierarchy = 'date'
