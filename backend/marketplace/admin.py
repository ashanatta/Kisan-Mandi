from django.contrib import admin

from .models import Category, Product, ProductImage, SellerReview


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
    list_display = ('seller', 'reviewer', 'rating', 'created_at')
    list_filter = ('rating',)
    search_fields = ('seller__username', 'reviewer__username', 'comment')
