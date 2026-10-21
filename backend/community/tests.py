import shutil
import tempfile
from datetime import timedelta
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APITestCase

from .models import Comment, Post, PostLike

User = get_user_model()
MEDIA = tempfile.mkdtemp()
URL = '/api/community/posts/'


def photo(name='crop.jpg'):
    buf = BytesIO()
    Image.new('RGB', (20, 20), 'green').save(buf, 'JPEG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


def video(name='field.mp4', body=b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 100):
    return SimpleUploadedFile(name, body, content_type='video/mp4')


@override_settings(MEDIA_ROOT=MEDIA, COMMUNITY_POSTS_PER_DAY=3, COMMUNITY_REPORTS_TO_HIDE=2, COMMUNITY_MAX_VIDEO_MB=1)
class CommunityTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        self.farmer = User.objects.create_user('farmer', 'f@example.com', 'pass12345!')
        self.other = User.objects.create_user('other', 'o@example.com', 'pass12345!')

    def post(self, user=None, **data):
        self.client.force_authenticate(user or self.farmer)
        return self.client.post(URL, data, format='multipart')

    def test_post_with_photo_and_video(self):
        res = self.post(text='My wheat field 🌾', topic='crop', files=[photo(), video()])
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual([m['kind'] for m in res.data['media']], ['image', 'video'])
        self.assertTrue(res.data['mine'])

    def test_feed_is_public(self):
        self.post(text='Hello')
        self.client.force_authenticate(None)
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['results'][0]['text'], 'Hello')
        self.assertFalse(res.data['results'][0]['liked'])

    def test_bad_files_are_rejected(self):
        fake_photo = SimpleUploadedFile('x.jpg', b'not an image', content_type='image/jpeg')
        self.assertEqual(self.post(files=[fake_photo]).status_code, 400)
        fake_video = video(body=b'MZ' + b'\x00' * 50)  # an .exe pretending to be a video
        self.assertEqual(self.post(files=[fake_video]).status_code, 400)
        huge = video(body=b'\x00\x00\x00\x18ftypmp42' + b'\x00' * (1024 * 1024 + 1))
        self.assertEqual(self.post(files=[huge]).status_code, 400)
        self.assertEqual(self.post(text='   ').status_code, 400)  # nothing to post
        self.assertFalse(Post.objects.exists())

    def test_phone_numbers_are_masked(self):
        res = self.post(text='Call me 0300-1234567 for seed')
        self.assertNotIn('1234567', res.data['text'])
        post_id = res.data['id']
        self.client.force_authenticate(self.other)
        res = self.client.post(f'{URL}{post_id}/comments/', {'text': 'WhatsApp 03001234567'})
        self.assertNotIn('1234567', res.data['text'])

    def test_like_toggles(self):
        post_id = self.post(text='Cow').data['id']
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(f'{URL}{post_id}/like/').data, {'liked': True, 'like_count': 1})
        self.assertTrue(self.client.get(f'{URL}{post_id}/').data['liked'])
        self.assertEqual(self.client.post(f'{URL}{post_id}/like/').data, {'liked': False, 'like_count': 0})
        self.assertFalse(PostLike.objects.exists())

    def test_comments_and_who_can_delete(self):
        post_id = self.post(text='Cotton').data['id']
        self.client.force_authenticate(self.other)
        comment_id = self.client.post(f'{URL}{post_id}/comments/', {'text': 'Nice crop!'}).data['id']
        self.assertEqual(self.client.get(f'{URL}{post_id}/').data['comment_count'], 1)
        stranger = User.objects.create_user('stranger', 's@example.com', 'pass12345!')
        self.client.force_authenticate(stranger)
        self.assertEqual(self.client.delete(f'/api/community/comments/{comment_id}/').status_code, 403)
        self.client.force_authenticate(self.farmer)  # the post's author may remove comments
        self.assertEqual(self.client.delete(f'/api/community/comments/{comment_id}/').status_code, 204)
        self.assertFalse(Comment.objects.exists())

    def test_only_author_deletes_post(self):
        post_id = self.post(text='Mine').data['id']
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.delete(f'{URL}{post_id}/').status_code, 403)
        self.client.force_authenticate(self.farmer)
        self.assertEqual(self.client.delete(f'{URL}{post_id}/').status_code, 204)

    def test_reports_hide_post(self):
        post_id = self.post(text='Spam').data['id']
        for name in ('r1', 'r2'):
            self.client.force_authenticate(User.objects.create_user(name, f'{name}@example.com', 'pass12345!'))
            self.client.post(f'{URL}{post_id}/report/', {'reason': 'spam'})
        self.assertTrue(Post.objects.get(pk=post_id).is_hidden)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(URL).data['count'], 0)
        self.client.force_authenticate(self.farmer)  # the author still sees it, marked hidden
        self.assertTrue(self.client.get(URL).data['results'][0]['is_hidden'])

    def test_daily_limit_and_suspended_users(self):
        for i in range(3):
            self.assertEqual(self.post(text=f'Post {i}').status_code, 201)
        self.assertEqual(self.post(text='One too many').status_code, 400)
        self.other.suspended_until = timezone.now() + timedelta(days=5)
        self.other.save()
        self.assertEqual(self.post(self.other, text='Hi').status_code, 403)
