from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html

from .models import Category, ListingReport, Product, ProductImage, SellerReview


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'name_ur', 'kind', 'parent', 'is_active', 'sort_order')
    list_filter = ('kind', 'is_active')
    search_fields = ('name', 'name_ur')
    prepopulated_fields = {'slug': ('name',)}


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('title', 'seller', 'category', 'price', 'quantity', 'unit', 'city', 'status', 'is_active', 'created_at')
    list_filter = ('status', 'is_active', 'category__kind', 'listing_type', 'condition')
    search_fields = ('title', 'description', 'city', 'district', 'seller__username')
    list_select_related = ('seller', 'category')
    inlines = [ProductImageInline]
    actions = ['approve', 'reject']

    @admin.action(description='Approve selected listings')
    def approve(self, request, queryset):
        queryset.update(status=Product.Status.APPROVED, rejection_reason='')

    @admin.action(description='Reject selected listings')
    def reject(self, request, queryset):
        queryset.update(status=Product.Status.REJECTED)


@admin.register(SellerReview)
class SellerReviewAdmin(admin.ModelAdmin):
    list_display = ('seller', 'reviewer', 'rating', 'verified_purchase', 'created_at')
    list_filter = ('rating',)
    search_fields = ('seller__username', 'reviewer__username', 'comment')

    @admin.display(boolean=True, description='Verified purchase')
    def verified_purchase(self, obj):
        return obj.order_id is not None


@admin.register(ListingReport)
class ListingReportAdmin(admin.ModelAdmin):
    list_display = ('product', 'reason', 'reporter', 'status', 'created_at')
    list_filter = ('status', 'reason')
    search_fields = ('product__title', 'reporter__username', 'details')
    list_select_related = ('product', 'reporter')
    readonly_fields = ('product_link', 'listing_status', 'reporter', 'reason', 'details', 'created_at')
    fields = readonly_fields + ('status',)
    actions = ['hide_listing', 'dismiss']

    @admin.display(description='Product')
    def product_link(self, obj):
        url = reverse('admin:marketplace_product_change', args=[obj.product_id])
        return format_html('<a href="{}">{}</a>', url, obj.product)

    @admin.display(description='Listing status now')
    def listing_status(self, obj):
        return obj.product.get_status_display()

    def has_add_permission(self, request):
        return False

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        # Setting the status here hides or restores the listing, same as the actions.
        if 'status' in form.changed_data:
            obj.apply_status()

    @admin.action(description='🚫 Hide the reported listings (action taken)')
    def hide_listing(self, request, queryset):
        for report in queryset.select_related('product'):
            report.set_status(ListingReport.Status.RESOLVED)

    @admin.action(description='✅ Dismiss – the listing is fine (restores it if it was hidden)')
    def dismiss(self, request, queryset):
        for report in queryset.select_related('product'):
            report.set_status(ListingReport.Status.DISMISSED)
