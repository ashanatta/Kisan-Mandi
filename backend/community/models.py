"""
Kisan Community: farmers share photos and videos of their crops and animals;
others like and comment. Contact details are masked like in chat, and posts
that several people report are hidden until an admin looks at them.
"""
import uuid
from pathlib import Path

from django.conf import settings
from django.db import models


def media_path(instance, filename):
    return f'community/{instance.post.created_at:%Y/%m}/{uuid.uuid4().hex}{Path(filename).suffix.lower()}'


class Post(models.Model):
    class Topic(models.TextChoices):
        CROP = 'crop', 'Crops'
        LIVESTOCK = 'livestock', 'Animals'
        MACHINERY = 'machinery', 'Machinery'
        QUESTION = 'question', 'Question / Help'
        OTHER = 'other', 'Other'

    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='community_posts')
    text = models.TextField(max_length=2000, blank=True)
    topic = models.CharField(max_length=10, choices=Topic.choices, default=Topic.CROP)
    # Admins hide posts; enough reports hide them automatically until reviewed.
    is_hidden = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['is_hidden', '-created_at'])]

    def __str__(self):
        return f'{self.author}: {self.text[:40] or "(media)"}'


class PostMedia(models.Model):
    class Kind(models.TextChoices):
        IMAGE = 'image', 'Image'
        VIDEO = 'video', 'Video'

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='media')
    file = models.FileField(upload_to=media_path)
    kind = models.CharField(max_length=5, choices=Kind.choices)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name_plural = 'post media'

    def __str__(self):
        return f'{self.kind} for post {self.post_id}'


class PostLike(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['post', 'user'], name='one_like_per_user')]


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    text = models.TextField(max_length=1000)
    is_hidden = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.author}: {self.text[:40]}'


class PostReport(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='reports')
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [models.UniqueConstraint(fields=['post', 'reporter'], name='one_report_per_user')]

    def __str__(self):
        return f'Report on post {self.post_id} by {self.reporter}'
