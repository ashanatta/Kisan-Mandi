from django.conf import settings
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

from chat.masking import mask_contact_details

from .models import Comment, Post, PostMedia

# Posts are public, so contact details are always hidden: deals go through the marketplace.
HIDDEN = '[🔒 number hidden – use Kisan Mandi]'
MAX_FILES = 6
MAX_IMAGE_BYTES = 8 * 1024 * 1024
VIDEO_TYPES = ('video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp')


class AuthorSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField(source='__str__')
    avatar = serializers.ImageField()
    city = serializers.CharField()
    is_verified = serializers.BooleanField()


class PostMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostMedia
        fields = ('id', 'kind', 'file')


class PostSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    media = PostMediaSerializer(many=True, read_only=True)
    topic_display = serializers.CharField(source='get_topic_display', read_only=True)
    like_count = serializers.IntegerField(read_only=True)
    comment_count = serializers.IntegerField(read_only=True)
    liked = serializers.BooleanField(read_only=True)
    mine = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = ('id', 'author', 'text', 'topic', 'topic_display', 'media', 'like_count', 'comment_count',
                  'liked', 'mine', 'is_hidden', 'created_at')

    def get_mine(self, post) -> bool:
        return post.author_id == self.context['request'].user.id


def _video_signature_ok(upload):
    """MP4 / MOV / 3GP have 'ftyp' at byte 4; WebM starts with the EBML magic number."""
    head = upload.read(12)
    upload.seek(0)
    return head[4:8] == b'ftyp' or head[:4] == b'\x1a\x45\xdf\xa3'


def media_kind(upload):
    """'image' or 'video' after checking the actual file content, or raise."""
    content_type = (upload.content_type or '').lower()
    if content_type in VIDEO_TYPES:
        limit = settings.COMMUNITY_MAX_VIDEO_MB * 1024 * 1024
        if upload.size > limit:
            raise serializers.ValidationError(f'"{upload.name}" is too big. Videos can be up to {settings.COMMUNITY_MAX_VIDEO_MB} MB.')
        if not _video_signature_ok(upload):
            raise serializers.ValidationError(f'"{upload.name}" is not a supported video (use MP4 or WebM).')
        return PostMedia.Kind.VIDEO
    if upload.size > MAX_IMAGE_BYTES:
        raise serializers.ValidationError(f'"{upload.name}" is too big. Photos can be up to 8 MB.')
    try:
        Image.open(upload).verify()
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise serializers.ValidationError(f'"{upload.name}" is not a photo or video we can show.')
    finally:
        upload.seek(0)
    return PostMedia.Kind.IMAGE


class PostCreateSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    topic = serializers.ChoiceField(choices=Post.Topic.choices, default=Post.Topic.CROP)
    files = serializers.ListField(child=serializers.FileField(), required=False, max_length=MAX_FILES,
                                  error_messages={'max_length': f'You can add up to {MAX_FILES} photos or videos.'})

    def validate(self, attrs):
        files = attrs.get('files', [])
        if not attrs.get('text', '').strip() and not files:
            raise serializers.ValidationError({'text': 'Write something or add a photo or video.'})
        attrs['kinds'] = [media_kind(f) for f in files]
        attrs['text'] = mask_contact_details(attrs.get('text', '').strip(), HIDDEN)[0]
        return attrs


class CommentSerializer(serializers.ModelSerializer):
    author = AuthorSerializer(read_only=True)
    mine = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = ('id', 'author', 'text', 'mine', 'created_at')

    def get_mine(self, comment) -> bool:
        return comment.author_id == self.context['request'].user.id

    def validate_text(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Write a comment.')
        return mask_contact_details(value, HIDDEN)[0]


class ReportSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)
