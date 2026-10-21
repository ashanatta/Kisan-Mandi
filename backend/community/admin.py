from django.contrib import admin
from django.db.models import Count
from django.utils.html import format_html

from .models import Comment, Post, PostMedia, PostReport


class PostMediaInline(admin.TabularInline):
    model = PostMedia
    extra = 0
    readonly_fields = ('kind', 'preview')
    fields = readonly_fields

    def preview(self, obj):
        if obj.kind == PostMedia.Kind.VIDEO:
            return format_html('<video src="{}" controls style="height:160px;border-radius:8px"></video>', obj.file.url)
        return format_html('<a href="{0}" target="_blank"><img src="{0}" style="height:160px;border-radius:8px"></a>', obj.file.url)

    def has_add_permission(self, request, obj=None):
        return False


class ReportInline(admin.TabularInline):
    model = PostReport
    extra = 0
    readonly_fields = ('reporter', 'reason', 'created_at')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    """Reported posts are hidden automatically; untick "is hidden" to show one again, or delete it."""

    list_display = ('__str__', 'author', 'topic', 'report_count', 'is_hidden', 'created_at')
    list_filter = ('is_hidden', 'topic')
    list_editable = ('is_hidden',)
    search_fields = ('text', 'author__username')
    readonly_fields = ('author', 'created_at')
    inlines = [PostMediaInline, ReportInline]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('author').annotate(n_reports=Count('reports'))

    @admin.display(description='Reports', ordering='n_reports')
    def report_count(self, obj):
        return obj.n_reports


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'post', 'is_hidden', 'created_at')
    list_filter = ('is_hidden',)
    list_editable = ('is_hidden',)
    search_fields = ('text', 'author__username')
    readonly_fields = ('post', 'author', 'created_at')
