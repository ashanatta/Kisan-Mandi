from django.core.management.base import BaseCommand

from orders.services import run_due_tasks


class Command(BaseCommand):
    help = 'Expire unpaid checkouts and release held money after the protection window. Run every few minutes (cron / Task Scheduler).'

    def handle(self, *args, **options):
        run_due_tasks()
        self.stdout.write(self.style.SUCCESS('Escrow tasks processed.'))
