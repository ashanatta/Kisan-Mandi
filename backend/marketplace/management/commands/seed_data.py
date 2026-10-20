"""
Seed categories and demo data.

    python manage.py seed_data

Safe to run again: categories are updated in place, and the demo users'
products, reviews and businesses are deleted and recreated.
"""
import io
import random
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from accounts.models import BannedCNIC, SellerStrike, SellerVerification
from chat.masking import mask_contact_details
from chat.models import Conversation, Message
from marketplace.models import Category, ListingReport, Product, ProductImage, SellerReview
from orders import services as order_services
from orders.models import CartItem, Order
from payments.models import Dispute, Payment, Payout, Refund
from payments.services import mark_paid
from tracker.models import Business, Expense, Income

User = get_user_model()

DEMO_PASSWORD = 'Demo@12345'
EMOJI_FONT = Path('C:/Windows/Fonts/seguiemj.ttf')

# slug, name, name_ur, kind, icon, children[(slug, name, name_ur, icon)]
CATEGORIES = [
    ('crops', 'Crops', 'فصلیں', 'crop', '🌾', [
        ('wheat', 'Wheat', 'گندم', '🌾'),
        ('rice', 'Rice', 'چاول', '🍚'),
        ('cotton', 'Cotton', 'کپاس', '☁️'),
        ('sugarcane', 'Sugarcane', 'گنا', '🎋'),
        ('maize', 'Maize', 'مکئی', '🌽'),
        ('vegetables', 'Vegetables', 'سبزیاں', '🥔'),
        ('fruits', 'Fruits', 'پھل', '🍊'),
    ]),
    ('fertilizers', 'Fertilizers', 'کھادیں', 'fertilizer', '🧪', [
        ('urea', 'Urea', 'یوریا', '🧪'),
        ('dap', 'DAP', 'ڈی اے پی', '🧪'),
        ('potash', 'Potash', 'پوٹاش', '🧪'),
        ('organic-fertilizer', 'Organic / Compost', 'نامیاتی کھاد', '🍂'),
    ]),
    ('sprays', 'Sprays / Pesticides', 'سپرے / زرعی ادویات', 'spray', '🧴', [
        ('insecticides', 'Insecticides', 'کیڑے مار دوا', '🐛'),
        ('herbicides', 'Herbicides', 'جڑی بوٹی مار', '🌿'),
        ('fungicides', 'Fungicides', 'پھپھوندی کش', '🍄'),
    ]),
    ('seeds', 'Seeds', 'بیج', 'seed', '🌱', [
        ('wheat-seed', 'Wheat Seed', 'گندم کا بیج', '🌱'),
        ('cotton-seed', 'Cotton Seed', 'کپاس کا بیج', '🌱'),
        ('vegetable-seed', 'Vegetable Seed', 'سبزیوں کے بیج', '🌱'),
        ('fodder-seed', 'Fodder Seed', 'چارے کے بیج', '🌱'),
    ]),
    ('equipment', 'Farm Equipment & Machinery', 'زرعی مشینری', 'equipment', '🚜', [
        ('tractors', 'Tractors', 'ٹریکٹر', '🚜'),
        ('harvesters', 'Harvesters', 'ہارویسٹر', '🌾'),
        ('implements', 'Implements & Tools', 'اوزار', '🛠️'),
        ('irrigation', 'Irrigation & Pumps', 'آبپاشی', '💧'),
    ]),
    ('livestock', 'Animals / Livestock', 'مویشی', 'livestock', '🐄', [
        ('cows', 'Cows', 'گائے', '🐄'),
        ('buffaloes', 'Buffaloes', 'بھینس', '🐃'),
        ('goats', 'Goats', 'بکریاں', '🐐'),
        ('sheep', 'Sheep', 'بھیڑ', '🐑'),
        ('poultry', 'Poultry', 'مرغیاں', '🐓'),
    ]),
]

# username, first, last, role, city, district, phone
USERS = [
    ('aslam', 'Muhammad', 'Aslam', 'seller', 'Okara', 'Okara', '03001234501'),
    ('tariq', 'Rana', 'Tariq', 'seller', 'Multan', 'Multan', '03001234502'),
    ('rasool', 'Ghulam', 'Rasool', 'seller', 'Sahiwal', 'Sahiwal', '03001234503'),
    ('nadia', 'Nadia', 'Bibi', 'seller', 'Faisalabad', 'Faisalabad', '03001234504'),
    ('kissan_store', 'Kissan Agro', 'Store', 'seller', 'Bahawalpur', 'Bahawalpur', '03001234505'),
    ('ali', 'Ali', 'Raza', 'buyer', 'Lahore', 'Lahore', '03001234506'),
    ('farhan', 'Farhan', 'Ahmed', 'buyer', 'Rahim Yar Khan', 'Rahim Yar Khan', '03001234507'),
    ('bilal', 'Bilal', 'Hussain', 'seller', 'Vehari', 'Vehari', '03001234508'),
]

# Image backgrounds per category kind: (top colour, bottom colour)
PALETTES = {
    'crop': [((254, 243, 199), (251, 191, 36)), ((255, 237, 213), (245, 158, 11))],
    'fertilizer': [((204, 251, 241), (45, 212, 191)), ((224, 242, 254), (56, 189, 248))],
    'spray': [((237, 233, 254), (167, 139, 250)), ((252, 231, 243), (244, 114, 182))],
    'seed': [((236, 252, 203), (132, 204, 22)), ((220, 252, 231), (74, 222, 128))],
    'equipment': [((255, 237, 213), (251, 146, 60)), ((254, 226, 226), (248, 113, 113))],
    'livestock': [((224, 242, 254), (134, 239, 172)), ((220, 252, 231), (56, 189, 248))],
}

P = Product
PRODUCTS = [
    # Crops
    dict(seller='aslam', category='wheat', title='Fresh Wheat – Akbar 2019 (New Crop)', price=3850, quantity=400,
         unit=P.Unit.MAUND, emojis=['🌾', '🌾🌾', '🍞'], link_business='Wheat Crop 2025-26',
         description='Clean, sun-dried wheat from this season. Moisture under 10%, no mud or straw. '
                     'Loading available at the farm; delivery within Okara district on request.'),
    dict(seller='tariq', category='rice', title='Super Basmati Rice – Kainat 1121', price=9200, quantity=150,
         unit=P.Unit.MAUND, emojis=['🍚', '🌾'],
         description='Long-grain Super Kernel basmati, well aged and polished. Ideal for traders and mills.'),
    dict(seller='tariq', category='cotton', title='Cotton Phutti – Long Staple', price=8700, quantity=90,
         unit=P.Unit.MAUND, emojis=['☁️', '🌱'],
         description='Clean picked phutti, low trash, good staple length. Ginning factories welcome.'),
    dict(seller='rasool', category='sugarcane', title='Sugarcane CPF-249 for Mills', price=425, quantity=2500,
         unit=P.Unit.MAUND, emojis=['🎋'],
         description='Healthy, high-recovery cane variety CPF-249. Ready for harvest in November.'),
    dict(seller='rasool', category='vegetables', title='Potatoes – Cardinal (Red Skin)', price=65, quantity=8000,
         unit=P.Unit.KG, emojis=['🥔', '🥔🥔'],
         description='Graded A-size red potatoes, fresh from cold store. Packed in 100 kg bags.'),
    dict(seller='nadia', category='fruits', title='Sargodha Kinnow – Export Quality', price=2600, quantity=300,
         unit=P.Unit.MAUND, emojis=['🍊', '🍊🍊'],
         description='Sweet and juicy kinnow, waxed and graded. Orchard pickup or delivery to Faisalabad mandi.'),
    dict(seller='aslam', category='maize', title='Yellow Maize – Dry Grain', price=2450, quantity=600,
         unit=P.Unit.MAUND, emojis=['🌽'],
         description='Dry yellow maize suitable for feed mills and poultry feed.'),

    # Fertilizers
    dict(seller='kissan_store', category='urea', title='Urea Fertilizer – 50 kg Bag', price=4650, quantity=500,
         unit=P.Unit.BAG, condition=P.Condition.NEW, emojis=['🧪', '🌱'],
         description='Original urea (46% N), sealed bags at control rate. Bulk discount on 50+ bags.'),
    dict(seller='kissan_store', category='dap', title='DAP Fertilizer – 50 kg Bag', price=12400, quantity=200,
         unit=P.Unit.BAG, condition=P.Condition.NEW, emojis=['🧪'],
         description='DAP (18-46-0) for sowing time. Genuine stock with invoice.'),
    dict(seller='kissan_store', category='organic-fertilizer', title='Organic Compost – Well Rotted', price=950,
         unit=P.Unit.BAG, quantity=1000, condition=P.Condition.NEW, emojis=['🍂', '🪱'],
         description='Farmyard compost, fully decomposed. Improves soil health and water holding.'),

    # Sprays
    dict(seller='kissan_store', category='insecticides', title='Emamectin Benzoate 1.9% EC – 1 Liter',
         price=3400, quantity=120, unit=P.Unit.LITER, condition=P.Condition.NEW, emojis=['🧴', '🐛'],
         description='Effective against armyworm and bollworm on cotton and vegetables.'),
    dict(seller='kissan_store', category='herbicides', title='Weed Killer for Wheat – 1 Liter', price=2100,
         quantity=80, unit=P.Unit.LITER, condition=P.Condition.NEW, emojis=['🧴', '🌿'],
         description='Post-emergence broad-leaf and narrow-leaf weed control for wheat.',
         status=P.Status.PENDING),

    # Seeds
    dict(seller='aslam', category='wheat-seed', title='Certified Wheat Seed – Akbar 2019 (50 kg)', price=7800,
         quantity=60, unit=P.Unit.BAG, condition=P.Condition.NEW, emojis=['🌱', '🌾'],
         description='Certified, treated seed with high germination. One bag per acre recommended.'),
    dict(seller='tariq', category='cotton-seed', title='Bt Cotton Seed – Delinted (10 kg)', price=3200,
         quantity=100, unit=P.Unit.BAG, condition=P.Condition.NEW, emojis=['🌱', '☁️'],
         description='Acid-delinted Bt cotton seed, germination tested.'),
    dict(seller='nadia', category='fodder-seed', title='Berseem Seed – Agaiti', price=650, quantity=400,
         unit=P.Unit.KG, condition=P.Condition.NEW, emojis=['🌱', '🍀'],
         description='Clean berseem seed for winter fodder. Multiple cuttings.'),

    # Equipment
    dict(seller='rasool', category='tractors', title='Massey Ferguson 385 – 2019 Model', price=3850000,
         quantity=1, unit=P.Unit.PIECE, condition=P.Condition.USED, brand='Massey Ferguson', model_year=2019,
         emojis=['🚜', '🚜'],
         description='Single owner, 2,900 hours, new tyres, documents complete. Ready to use.'),
    dict(seller='tariq', category='harvesters', title='Combine Harvester on Rent – Wheat & Rice',
         price=6500, quantity=1, unit=P.Unit.PIECE, condition=P.Condition.USED,
         listing_type=P.ListingType.RENT, rent_period=P.RentPeriod.ACRE, brand='Kubota',
         emojis=['🌾', '🚜'],
         description='Kubota combine with operator. Available across Multan, Khanewal and Vehari.'),
    dict(seller='aslam', category='implements', title='Rotavator on Rent', price=3000, quantity=1,
         unit=P.Unit.PIECE, condition=P.Condition.USED, listing_type=P.ListingType.RENT,
         rent_period=P.RentPeriod.ACRE, emojis=['🛠️', '🚜'],
         description='Heavy-duty 42-blade rotavator for seedbed preparation. Tractor and driver included.'),
    dict(seller='kissan_store', category='irrigation', title='Solar Water Pump 10 HP – Complete Kit',
         price=1150000, quantity=3, unit=P.Unit.PIECE, condition=P.Condition.NEW, brand='SunFlow',
         model_year=2026, emojis=['☀️', '💧'],
         description='10 HP solar pump with panels, inverter and installation. 5-year warranty.'),

    # Livestock
    dict(seller='nadia', category='cows', title='Sahiwal Cow – 12 Liters Milk', price=340000, quantity=1,
         unit=P.Unit.PIECE, breed='Sahiwal', gender=P.Gender.FEMALE, age_months=48, weight_kg=420,
         milk_liters_per_day=12, emojis=['🐄', '🥛'],
         description='Pure Sahiwal, second lactation, calm temperament. Vaccinated and dewormed.'),
    dict(seller='nadia', category='buffaloes', title='Nili-Ravi Buffalo – 14 Liters Milk', price=465000,
         quantity=1, unit=P.Unit.PIECE, breed='Nili-Ravi', gender=P.Gender.FEMALE, age_months=60,
         weight_kg=550, milk_liters_per_day=14, emojis=['🐃', '🥛'],
         description='Healthy Nili-Ravi with five white marks. Third lactation, milk test welcome.'),
    dict(seller='rasool', category='goats', title='Beetal Goat – Pair for Breeding', price=115000,
         quantity=2, unit=P.Unit.PIECE, breed='Beetal', gender=P.Gender.FEMALE, age_months=18, weight_kg=45,
         emojis=['🐐', '🐐'],
         description='Two young Beetal does, good height and ears. Price is per animal.'),
    dict(seller='tariq', category='sheep', title='Kajli Sheep – Ready for Eid', price=88000, quantity=6,
         unit=P.Unit.PIECE, breed='Kajli', gender=P.Gender.MALE, age_months=14, weight_kg=52,
         emojis=['🐑'],
         description='Well-fed Kajli rams, tall and healthy. Price per animal.',
         status=P.Status.PENDING),
    dict(seller='aslam', category='poultry', title='Desi Hens – Egg Laying', price=1800, quantity=40,
         unit=P.Unit.PIECE, breed='Desi (Aseel cross)', gender=P.Gender.FEMALE, age_months=8,
         emojis=['🐓', '🥚'],
         description='Free-range desi hens currently laying. Price per bird.'),
]

REVIEWS = [
    ('ali', 'aslam', 5, 'Wheat quality was excellent and delivery was on time.'),
    ('farhan', 'aslam', 4, 'Good seed, honest seller.'),
    ('ali', 'nadia', 5, 'Cow is exactly as described, gives full milk. Highly recommended!'),
    ('farhan', 'kissan_store', 5, 'Original fertilizer at fair rates.'),
    ('ali', 'kissan_store', 4, 'Quick service, bags were sealed.'),
    ('farhan', 'tariq', 4, 'Combine operator was skilled, finished 20 acres in a day.'),
    ('ali', 'rasool', 3, 'Potatoes were fine but delivery was a bit late.'),
]


def _font(size):
    try:
        return ImageFont.truetype(str(EMOJI_FONT), size)
    except OSError:
        return None


def make_image(emoji, kind, variant):
    """A soft gradient card with a big emoji, 800×600 JPEG."""
    width, height = 800, 600
    top, bottom = PALETTES[kind][variant % 2]
    img = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(img)
    for y in range(height):
        t = y / height
        draw.line([(0, y), (width, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))

    # Soft glow behind the subject
    glow = Image.new('L', (width, height), 0)
    cx = 400 + (60 if variant % 2 else -60)
    ImageDraw.Draw(glow).ellipse((cx - 230, 70, cx + 230, 530), fill=150)
    img.paste((255, 255, 255), mask=glow.filter(ImageFilter.GaussianBlur(60)))

    # Rolling field at the bottom
    hill = Image.new('L', (width, height), 0)
    ImageDraw.Draw(hill).ellipse((-200, 480, 1000, 900), fill=90)
    img.paste((255, 255, 255), mask=hill.filter(ImageFilter.GaussianBlur(8)))

    big, small = _font(240 if len(emoji) == 1 else 170), _font(70)
    if big:
        draw = ImageDraw.Draw(img)
        for (x, y) in ((90, 90), (700, 120), (110, 470)):
            layer = Image.new('RGBA', (width, height), (0, 0, 0, 0))
            ImageDraw.Draw(layer).text((x, y), emoji[0], font=small, embedded_color=True, anchor='mm')
            alpha = layer.getchannel('A').point(lambda a: a * 0.25)
            layer.putalpha(alpha)
            img.paste(layer, mask=layer)
        draw.text((cx, 300), emoji, font=big, embedded_color=True, anchor='mm')

    buffer = io.BytesIO()
    img.save(buffer, 'JPEG', quality=88)
    return ContentFile(buffer.getvalue())


def month_starts(start, end):
    current = date(start.year, start.month, 1)
    while current <= end:
        yield current
        current = date(current.year + current.month // 12, current.month % 12 + 1, 1)


class Command(BaseCommand):
    help = 'Seed categories and demo users, products, reviews and farm businesses.'

    @transaction.atomic
    def handle(self, *args, **options):
        self.rng = random.Random(42)
        categories = self.seed_categories()
        users = self.seed_users()
        businesses = self.seed_tracker(users['aslam'])
        self.seed_products(users, categories, businesses)
        self.seed_trust(users)
        self.seed_orders(users)
        self.seed_reviews(users)
        self.seed_chat(users)
        self.stdout.write(self.style.SUCCESS(
            f'Seeded {Category.objects.count()} categories, {Product.objects.count()} products, '
            f'{SellerReview.objects.count()} reviews, {Order.objects.count()} orders, '
            f'{Dispute.objects.count()} disputes, {Payout.objects.count()} payouts, {Refund.objects.count()} refunds, '
            f'{Business.objects.count()} businesses, '
            f'{Expense.objects.count()} expenses, {Income.objects.count()} incomes.'
        ))
        self.stdout.write(f'Demo logins (password "{DEMO_PASSWORD}"): ' + ', '.join(u[0] for u in USERS))

    def seed_categories(self):
        by_slug = {}
        for order, (slug, name, name_ur, kind, icon, children) in enumerate(CATEGORIES):
            parent, _ = Category.objects.update_or_create(
                slug=slug,
                defaults=dict(name=name, name_ur=name_ur, kind=kind, icon=icon, parent=None, sort_order=order),
            )
            by_slug[slug] = parent
            for child_order, (c_slug, c_name, c_name_ur, c_icon) in enumerate(children):
                by_slug[c_slug], _ = Category.objects.update_or_create(
                    slug=c_slug,
                    defaults=dict(name=c_name, name_ur=c_name_ur, kind=kind, icon=c_icon,
                                  parent=parent, sort_order=child_order),
                )
        return by_slug

    def seed_users(self):
        users = {}
        for username, first, last, role, city, district, phone in USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults=dict(email=f'{username}@demo.agrishop.local'),
            )
            user.first_name, user.last_name, user.role = first, last, role
            user.city, user.district, user.phone, user.whatsapp = city, district, phone, phone
            user.is_verified = False  # re-granted in seed_trust()
            user.is_banned, user.suspended_until, user.is_active = False, None, True
            if role == 'seller':
                user.payout_method, user.payout_account_title, user.payout_account_number = 'jazzcash', f'{first} {last}', phone
            if created:
                user.set_password(DEMO_PASSWORD)
            user.save()
            users[username] = user

        demo_users = list(users.values())
        demo_orders = Order.objects.filter(Q(buyer__in=demo_users) | Q(seller__in=demo_users))
        Refund.objects.filter(order__in=demo_orders).delete()
        Payout.objects.filter(order__in=demo_orders).delete()
        demo_orders.delete()
        Payment.objects.filter(buyer__in=demo_users).delete()
        CartItem.objects.filter(user__in=demo_users).delete()
        Conversation.objects.filter(Q(buyer__in=demo_users) | Q(seller__in=demo_users)).delete()
        SellerStrike.objects.filter(seller__in=demo_users).delete()
        BannedCNIC.objects.filter(user__in=demo_users).delete()

        demo_sellers = [u for u in users.values() if u.role == User.Role.SELLER]
        for image in ProductImage.objects.filter(product__seller__in=demo_sellers):
            image.image.delete(save=False)
        Product.objects.filter(seller__in=demo_sellers).delete()
        SellerReview.objects.filter(seller__in=users.values()).delete()
        SellerVerification.objects.filter(user__in=demo_users).delete()
        Business.objects.filter(owner__in=users.values()).delete()
        return users

    def seed_products(self, users, categories, businesses):
        # Spread "posted" times over the last 20 days in a mixed order,
        # so the newest listings are not all from one category.
        ages = [timedelta(hours=h) for h in sorted(self.rng.sample(range(2, 480), len(PRODUCTS)))]
        self.rng.shuffle(ages)
        now = timezone.now()

        for spec, age in zip(PRODUCTS, ages):
            spec = dict(spec)
            emojis = spec.pop('emojis')
            link = spec.pop('link_business', None)
            category = categories[spec.pop('category')]
            seller = users[spec.pop('seller')]
            product = Product.objects.create(
                seller=seller,
                category=category,
                city=seller.city,
                district=seller.district,
                status=spec.pop('status', Product.Status.APPROVED),
                linked_business=businesses.get(link),
                views_count=self.rng.randint(15, 600),
                **spec,
            )
            for i, emoji in enumerate(emojis):
                image = ProductImage(product=product, is_primary=(i == 0), sort_order=i)
                image.image.save(f'{category.slug}-{product.pk}-{i}.jpg', make_image(emoji, category.kind, i), save=False)
                image.save()
            Product.objects.filter(pk=product.pk).update(created_at=now - age, updated_at=now - age)

    def seed_orders(self, users):
        """
        Real checkouts through the escrow flow (test gateway), so payments, held money,
        payouts, refunds, disputes, stock and tracker income stay consistent.
        """
        S = Order.Status

        def fill_cart(buyer, lines):
            for title, qty in lines:
                product = Product.objects.get(title__startswith=title)
                CartItem.objects.create(user=buyer, product=product, quantity=Decimal(qty))

        def buy(buyer, address, method='jazzcash'):
            shipping = dict(full_name=str(buyer), phone=buyer.phone, address=address,
                            city=buyer.city, district=buyer.district)
            payment, orders = order_services.checkout(buyer, shipping, method)
            mark_paid(payment, gateway='test', txn_id=f'TEST-{payment.reference}')
            return {o.seller.username: o for o in orders}

        def age(orders, days):
            Order.objects.filter(pk__in=[o.pk for o in orders]).update(
                created_at=timezone.now() - timedelta(days=days, hours=self.rng.randint(0, 8))
            )

        def step(order, user, *statuses):
            for status in statuses:
                order = order_services.change_status(order, status, user)
            return order

        ali, farhan, aslam, kissan = users['ali'], users['farhan'], users['aslam'], users['kissan_store']

        # Ali buys from three sellers. Wheat completes (money released to Aslam),
        # DAP is confirmed, the cow is paid and waiting for Nadia.
        fill_cart(ali, [('Fresh Wheat', 20), ('DAP Fertilizer', 2), ('Sahiwal Cow', 1)])
        orders = buy(ali, 'House 12, Block C, Model Town')
        wheat = step(orders['aslam'], aslam, S.CONFIRMED, S.SHIPPED, S.DELIVERED)
        step(wheat, ali, S.COMPLETED)  # buyer: "I received it - release the money"
        step(orders['kissan_store'], kissan, S.CONFIRMED)
        age(orders.values(), 6)

        # Farhan: hens + rotavator rent from Aslam, delivered, then a dispute about sick hens.
        fill_cart(farhan, [('Rotavator on Rent', 5), ('Desi Hens', 10)])
        hens = buy(farhan, 'Chak 45, near Government School', method='easypaisa')['aslam']
        hens = step(hens, aslam, S.CONFIRMED, S.SHIPPED, S.DELIVERED)
        order_services.open_dispute(
            hens, farhan, Dispute.Reason.SICK_ANIMAL,
            '3 of the 10 hens were sick on arrival and one died the next day. The seller said they were healthy.',
        )
        order_services.respond_to_dispute(
            hens, aslam, 'All hens were vaccinated and healthy when loaded. The trip was 6 hours in hot weather.',
        )
        age([hens], 2)

        # Farhan: urea, paid then cancelled by the buyer -> full refund owed.
        fill_cart(farhan, [('Urea Fertilizer', 10)])
        urea = buy(farhan, 'Chak 45, near Government School')['kissan_store']
        order_services.change_status(urea, S.CANCELLED, farhan, note='Bought locally instead')
        age([urea], 3)

        # Leave a couple of items in Ali's cart
        fill_cart(ali, [('Super Basmati', 5), ('Bt Cotton Seed', 2)])

    def seed_reviews(self, users):
        for reviewer, seller, rating, comment in REVIEWS:
            # Linked to a delivered order when one exists → shown as "verified purchase"
            order = Order.objects.filter(
                buyer=users[reviewer], seller=users[seller], status=Order.Status.DELIVERED
            ).first()
            SellerReview.objects.create(
                reviewer=users[reviewer], seller=users[seller], rating=rating, comment=comment, order=order
            )
        review = SellerReview.objects.get(reviewer=users['ali'], seller=users['nadia'])
        review.seller_reply = 'JazakAllah! Her calf is also available next month, call me anytime.'
        review.replied_at = timezone.now()
        review.save()

    def seed_trust(self, users):
        """Verified sellers (only they can sell), one pending verification and one open listing report."""
        for i, username in enumerate(('aslam', 'tariq', 'rasool', 'nadia', 'kissan_store'), start=1):
            user = users[username]
            SellerVerification.objects.create(
                user=user, cnic_number=f'35202-000000{i}-1', name_on_cnic=str(user)
            ).approve(None)
            user.refresh_from_db()
        SellerVerification.objects.create(
            user=users['bilal'], cnic_number='36302-0000009-1', name_on_cnic=str(users['bilal'])
        )
        ListingReport.objects.create(
            product=Product.objects.get(title__startswith='Massey Ferguson'),
            reporter=users['farhan'],
            reason=ListingReport.Reason.WRONG_INFO,
            details='Seller told me on the phone that the price is higher than listed.',
        )

    def seed_chat(self, users):
        """Farhan asks Nadia about the buffalo; her phone number is hidden because he hasn't paid yet."""
        farhan, nadia = users['farhan'], users['nadia']
        conv = Conversation.objects.create(
            product=Product.objects.get(title__startswith='Nili-Ravi Buffalo'), buyer=farhan, seller=nadia
        )
        for sender, text in [
            (farhan, 'Assalam-o-Alaikum, is the buffalo still available? How many months pregnant is she?'),
            (nadia, 'Walaikum Assalam. Yes available, 3 months pregnant. Call me on 0300-1234504 to visit.'),
            (farhan, 'JazakAllah, I will order through Kisan Mandi so the payment is protected.'),
        ]:
            body, masked = mask_contact_details(text)
            Message.objects.create(conversation=conv, sender=sender, body=body, was_masked=masked)

    def seed_tracker(self, owner):
        rng = self.rng
        today = date.today()

        def jitter(amount):
            return Decimal(round(amount * rng.uniform(0.9, 1.1), -1))

        def add_expense(business, category, amount, day, notes=''):
            if day <= today:
                Expense.objects.create(business=business, category=category, amount=jitter(amount),
                                       date=day, notes=notes)

        def add_income(business, source, amount, day, notes='', quantity=None, unit=''):
            if day <= today:
                Income.objects.create(business=business, source=source, amount=jitter(amount), date=day,
                                      notes=notes, quantity=quantity, unit=unit)

        E, I = Expense.Category, Income.Source

        wheat = Business.objects.create(
            owner=owner, name='Wheat Crop 2025-26', business_type=Business.BusinessType.CROP,
            season=Business.Season.RABI, area_acres=Decimal('12.5'),
            start_date=date(2025, 11, 1), end_date=date(2026, 5, 15),
            is_active=False, description='Akbar-2019 wheat on 12.5 acres, canal + tubewell irrigation.',
        )
        for args in [
            (E.MACHINERY_RENT, 37500, date(2025, 11, 3), 'Rotavator + leveller, 12.5 acres'),
            (E.SEED, 97500, date(2025, 11, 8), '12.5 bags certified seed'),
            (E.FERTILIZER, 155000, date(2025, 11, 8), 'DAP at sowing'),
            (E.FUEL, 28000, date(2025, 11, 10), 'Diesel for sowing'),
            (E.LABOR, 18000, date(2025, 11, 12), 'Sowing labour'),
            (E.FERTILIZER, 58000, date(2025, 12, 10), 'Urea – 1st dose'),
            (E.SPRAY, 26000, date(2025, 12, 22), 'Weedicide'),
            (E.FERTILIZER, 58000, date(2026, 1, 15), 'Urea – 2nd dose'),
            (E.SPRAY, 14000, date(2026, 2, 18), 'Rust / aphid spray'),
            (E.MACHINERY_RENT, 81000, date(2026, 4, 22), 'Combine harvester'),
            (E.LABOR, 45000, date(2026, 4, 25), 'Harvest + bhoosa labour'),
            (E.TRANSPORT, 22000, date(2026, 4, 28), 'Trolley to mandi'),
        ]:
            add_expense(wheat, *args)
        for month in month_starts(date(2025, 11, 1), date(2026, 3, 1)):
            add_expense(wheat, E.IRRIGATION, 9000, month.replace(day=20), 'Abiana + tubewell')
        add_income(wheat, I.CROP_SALE, 1_406_000, date(2026, 5, 2), '380 maund @ 3,700', 380, 'maund')
        add_income(wheat, I.CROP_SALE, 520_000, date(2026, 6, 15), '135 maund stored, sold later', 135, 'maund')
        add_income(wheat, I.OTHER, 165_000, date(2026, 5, 5), 'Bhoosa (straw) sale')

        cotton = Business.objects.create(
            owner=owner, name='Cotton Season 2026', business_type=Business.BusinessType.CROP,
            season=Business.Season.KHARIF, area_acres=Decimal('8'), start_date=date(2026, 5, 1),
            description='Bt cotton on 8 acres. Whitefly attack in August reduced yield.',
        )
        for args in [
            (E.MACHINERY_RENT, 24000, date(2026, 5, 3), 'Land preparation'),
            (E.SEED, 25600, date(2026, 5, 6), '8 bags Bt seed'),
            (E.FERTILIZER, 99000, date(2026, 5, 6), 'DAP'),
            (E.FERTILIZER, 74000, date(2026, 6, 20), 'Urea'),
            (E.LABOR, 22000, date(2026, 6, 25), 'Hoeing / weeding'),
            (E.LABOR, 68000, date(2026, 9, 25), 'Picking – 1st'),
            (E.LABOR, 54000, date(2026, 10, 15), 'Picking – 2nd'),
        ]:
            add_expense(cotton, *args)
        for i, month in enumerate(month_starts(date(2026, 6, 1), date(2026, 10, 1))):
            add_expense(cotton, E.SPRAY, 38000 if month.month in (7, 8) else 18000, month.replace(day=5), 'Pest spray')
            add_expense(cotton, E.IRRIGATION, 11000, month.replace(day=12), 'Tubewell')
            add_expense(cotton, E.FUEL, 9000, month.replace(day=14), 'Diesel')
        add_income(cotton, I.CROP_SALE, 330_000, date(2026, 10, 2), '38 maund phutti', 38, 'maund')
        add_income(cotton, I.CROP_SALE, 245_000, date(2026, 10, 18), '28 maund phutti', 28, 'maund')

        dairy = Business.objects.create(
            owner=owner, name='Dairy Farm', business_type=Business.BusinessType.DAIRY,
            season=Business.Season.YEAR_ROUND, start_date=date(2025, 7, 1),
            description='6 Nili-Ravi buffaloes and 3 Sahiwal cows.',
        )
        for month in month_starts(date(2025, 7, 1), today):
            add_expense(dairy, E.FEED, 92000, month.replace(day=3), 'Wanda, khal, chokar')
            add_expense(dairy, E.LABOR, 32000, month.replace(day=28), 'Two workers')
            add_expense(dairy, E.ELECTRICITY, 7500, month.replace(day=18), 'Fans and motor')
            if month.month % 2 == 0:
                add_expense(dairy, E.VET, 9000, month.replace(day=10), 'Vaccination / medicine')
            # Less milk in hot months
            milk = 270000 if month.month in (6, 7, 8) else 330000
            add_income(dairy, I.MILK_SALE, milk, month.replace(day=27), 'Milk to collection centre',
                       Decimal(milk // 190), 'liter')
        add_income(dairy, I.ANIMAL_SALE, 210000, date(2025, 12, 14), 'Sold male calf (Nili-Ravi)')
        add_income(dairy, I.ANIMAL_SALE, 185000, date(2026, 6, 10), 'Sold dry cow before Eid')

        poultry = Business.objects.create(
            owner=owner, name='Desi Poultry', business_type=Business.BusinessType.POULTRY,
            season=Business.Season.YEAR_ROUND, start_date=date(2026, 1, 10),
            description='200 desi hens, free-range shed.',
        )
        add_expense(poultry, E.OTHER, 85000, date(2026, 1, 10), 'Shed repair and nets')
        add_expense(poultry, E.OTHER, 160000, date(2026, 1, 12), '200 pullets')
        for month in month_starts(date(2026, 1, 1), today):
            add_expense(poultry, E.FEED, 38000, month.replace(day=5), 'Layer feed')
            add_expense(poultry, E.VET, 4500, month.replace(day=15), 'Vaccines / vitamins')
            if month >= date(2026, 3, 1):
                add_income(poultry, I.EGG_SALE, 62000, month.replace(day=26), 'Desi eggs', None, '')
        add_income(poultry, I.ANIMAL_SALE, 48000, date(2026, 8, 20), 'Sold 30 roosters')

        return {b.name: b for b in (wheat, cotton, dairy, poultry)}
