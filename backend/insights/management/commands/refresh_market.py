from django.core.management.base import BaseCommand

from insights.sources import ai_enabled, refresh


class Command(BaseCommand):
    help = 'Fetch market prices (Gemini + Google Search) and agriculture news. Run daily from cron / Task Scheduler.'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Refresh even if the data is still fresh')

    def handle(self, *args, force=False, **options):
        if not ai_enabled():
            self.stdout.write(self.style.WARNING('GEMINI_API_KEY not set – fetching news only.'))
        report = refresh(force=force)
        if 'prices_error' in report:
            self.stdout.write(self.style.ERROR(f"Prices failed: {report['prices_error']}"))
        self.stdout.write(self.style.SUCCESS(f'Done: {report or "everything is fresh"}'))
