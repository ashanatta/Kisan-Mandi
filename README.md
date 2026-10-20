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

## Project structure

```
backend/    Django project (config) and apps: accounts, marketplace, orders, tracker
frontend/   React app (src/pages, src/components, src/i18n, src/context)
```
