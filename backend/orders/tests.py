import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from payments.models import Dispute

from . import services
from .models import Order

User = get_user_model()
S = Order.Status
MEDIA = tempfile.mkdtemp()


def photo():
    buf = BytesIO()
    Image.new('RGB', (10, 10), 'green').save(buf, 'JPEG')
    return SimpleUploadedFile('proof.jpg', buf.getvalue(), content_type='image/jpeg')


@override_settings(MEDIA_ROOT=MEDIA, PROTECTION_DAYS=3, UNVERIFIED_PROTECTION_DAYS=7, MAX_DELIVERY_CODE_ATTEMPTS=5)
class DeliveryProofTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        self.buyer = User.objects.create_user('buyer', 'b@example.com', 'pass12345!')
        self.seller = User.objects.create_user('seller', 's@example.com', 'pass12345!', role='seller')
        self.order = Order.objects.create(
            buyer=self.buyer, seller=self.seller, status=S.SHIPPED, paid_at=timezone.now(),
            full_name='Ali', phone='03001234567', address='Village', city='Okara', district='Okara',
            total=Decimal('1000'),
        )

    def deliver(self, **data):
        self.client.force_authenticate(self.seller)
        return self.client.post(f'/api/orders/{self.order.pk}/deliver/', data, format='multipart')

    def detail(self, user):
        self.client.force_authenticate(user)
        return self.client.get(f'/api/orders/{self.order.pk}/').data

    def test_code_is_shown_only_to_the_buyer(self):
        self.assertEqual(self.detail(self.buyer)['delivery_code'], self.order.delivery_code)
        self.assertIsNone(self.detail(self.seller)['delivery_code'])

    def test_right_code_verifies_delivery(self):
        res = self.deliver(code=self.order.delivery_code)
        self.assertEqual(res.status_code, 200, res.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, S.DELIVERED)
        self.assertTrue(self.order.delivery_verified)
        self.assertIsNone(self.detail(self.buyer)['delivery_code'])  # hidden once used

    def test_wrong_code_counts_attempts_and_locks(self):
        wrong = '0000' if self.order.delivery_code != '0000' else '1111'
        for _ in range(5):
            self.assertEqual(self.deliver(code=wrong).status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.delivery_code_attempts, 5)
        # Even the right code is refused now; only photo proof works.
        self.assertEqual(self.deliver(code=self.order.delivery_code).status_code, 400)
        self.assertEqual(self.deliver(proof=photo()).status_code, 200)

    def test_delivered_without_code_or_proof_is_refused(self):
        self.assertEqual(self.deliver().status_code, 400)
        self.client.force_authenticate(self.seller)
        res = self.client.post(f'/api/orders/{self.order.pk}/status/', {'status': S.DELIVERED})
        self.assertEqual(res.status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, S.SHIPPED)

    def test_photo_proof_delivery_is_unverified(self):
        res = self.deliver(proof=photo(), courier_name='TCS', tracking_number='77001')
        self.assertEqual(res.status_code, 200, res.data)
        self.order.refresh_from_db()
        self.assertFalse(self.order.delivery_verified)
        self.assertEqual(self.order.tracking_number, '77001')
        self.assertTrue(self.order.delivery_proof)

    def test_not_received_dispute_blocked_after_code(self):
        self.deliver(code=self.order.delivery_code)
        self.order.refresh_from_db()
        with self.assertRaises(ValidationError):
            services.open_dispute(self.order, self.buyer, Dispute.Reason.NOT_RECEIVED, 'Never came')
        # Other problems can still be reported.
        services.open_dispute(self.order, self.buyer, Dispute.Reason.DAMAGED, 'Wet bags')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, S.DISPUTED)

    def test_not_received_dispute_allowed_after_photo_delivery(self):
        self.deliver(proof=photo())
        self.order.refresh_from_db()
        services.open_dispute(self.order, self.buyer, Dispute.Reason.NOT_RECEIVED, 'Never came')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, S.DISPUTED)

    def test_auto_release_waits_longer_without_code(self):
        self.deliver(proof=photo())
        Order.objects.filter(pk=self.order.pk).update(delivered_at=timezone.now() - timedelta(days=4))
        services.run_due_tasks()
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, S.DELIVERED)  # 7-day window still open

        Order.objects.filter(pk=self.order.pk).update(delivered_at=timezone.now() - timedelta(days=8))
        services.run_due_tasks()
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, S.COMPLETED)

    def test_auto_release_after_three_days_with_code(self):
        self.deliver(code=self.order.delivery_code)
        Order.objects.filter(pk=self.order.pk).update(delivered_at=timezone.now() - timedelta(days=4))
        services.run_due_tasks()
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, S.COMPLETED)
