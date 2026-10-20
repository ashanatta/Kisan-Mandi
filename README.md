# Kisan-Mandi

An online agriculture marketplace for Pakistani farmers — buy and sell crops, seeds, fertilizer, sprays, machinery and livestock — plus a farm expense tracker that shows profit and loss for each farm business.

- **Backend:** Django + Django REST Framework, JWT auth, MySQL / PostgreSQL / SQLite, Swagger docs
- **Frontend:** React (Vite), React Router, Axios, Tailwind CSS, Recharts, English + Urdu (RTL)

## Quick start (Windows)

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env          # then set SECRET_KEY and database settings
.\venv\Scripts\python.exe manage.py migrate
.\venv\Scripts\python.exe manage.py seed_data        # categories + demo data
.\venv\Scripts\python.exe manage.py createsuperuser
.\venv\Scripts\python.exe manage.py runserver
```

- API: http://127.0.0.1:8000/api/
- API docs (Swagger): http://127.0.0.1:8000/api/docs/
- Django admin: http://127.0.0.1:8000/admin/

With WAMP MySQL, create the database first:
`CREATE DATABASE agri_shop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`

### Frontend

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open http://127.0.0.1:5173/

### Demo accounts (after `seed_data`)

| Role | Username | Password |
|---|---|---|
| Seller | `aslam` | `Demo@12345` |
| Buyer | `ali` | `Demo@12345` |

## Kisan Mandi Protection (escrow)

Buyers pay the platform, never the seller. Money is held until the buyer confirms delivery
(or `PROTECTION_DAYS` pass without a complaint), then released to the seller as a payout.
Disputes freeze the money until an admin decides in **Django admin → Disputes**; refunds and
payouts are sent by an admin and recorded in **Refunds** / **Payouts**.

- Only CNIC-verified sellers can list; seller phone numbers are hidden until a buyer has paid.
- Losing disputes gives strikes: 2 = 30-day suspension, 3 or proven fraud = ban (CNIC blocked).
- Locally, `PAYMENT_TEST_MODE=True` gives a simulated gateway. Put your JazzCash merchant
  credentials in `backend/.env` to use the JazzCash sandbox, and set `PAYMENT_TEST_MODE=False`
  in production.
- Run this every few minutes in production (cron / Windows Task Scheduler) to expire unpaid
  checkouts and auto-release money:

  ```powershell
  .\venv\Scripts\python.exe manage.py process_escrow
  ```

## Project structure

```
backend/    Django project (config) and apps: accounts, marketplace, orders, tracker
frontend/   React app (src/pages, src/components, src/i18n, src/context)
```
