# Careflow Health

Careflow is a full-stack healthcare assistant starter application. It includes a responsive React dashboard, a Django REST API, PostgreSQL support, patient/doctor/administrator roles, appointment and availability workflows, private health records, and an optional AI health information endpoint.

> **Important:** This application provides general information only. It is not a medical device and does not provide diagnoses, treatment plans, or prescriptions. It is not configured or certified for production handling of regulated health data. Complete a privacy, security, clinical-safety, and compliance review before using real patient information.

## Requirements

- Node.js 20+
- Python 3.10+
- PostgreSQL 14+ (or SQLite for local API development)

## Run locally

1. Start PostgreSQL, or use the included database container:

   ```powershell
   docker compose up -d db
   ```

2. Set up the API:

   ```powershell
   cd backend
   py -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   $env:DJANGO_SECRET_KEY = "replace-with-a-long-random-secret"
   $env:POSTGRES_DB = "careflow"
   $env:POSTGRES_USER = "careflow"
   $env:POSTGRES_PASSWORD = "careflow-local"
   $env:POSTGRES_HOST = "localhost"
   py manage.py migrate
   py manage.py seed_demo
   py manage.py runserver
   ```

   To use SQLite instead, leave the `POSTGRES_*` variables unset. Create a Django administrator with `py manage.py createsuperuser`; Django admin is at `http://localhost:8000/admin/`.

3. Configure the AI service (optional, required for non-emergency chatbot answers). Set `AI_API_URL` to an OpenAI-compatible **chat completions endpoint**, `AI_API_KEY` to a server-side secret, and optionally `AI_MODEL`. Never put the key in the frontend. When the AI is not configured or unavailable, the API returns an explicit service error. Emergency-keyword screening works without the AI service.

4. Start the frontend in another terminal:

   ```powershell
   cd frontend
   npm install
   Copy-Item .env.example .env
   npm run dev
   ```

   Open `http://localhost:5173`. Override `VITE_API_URL` in `frontend/.env` when the API is hosted elsewhere.

## Local demo accounts

`py manage.py seed_demo` creates:

| Role | Username |
|---|---|
| Patient | `olivia` |
| Doctor | `amelia` |
| Administrator | `careadmin` |

The command prints the local demo password. It defaults to a test-only password and accepts `DEMO_PASSWORD` to override it. These accounts and sample records are for local testing only; do not deploy them.

New users can register as patients from the app. Doctor and administrator accounts are intentionally provisioned by an administrator. The Django admin interface can be used to create users and assign their `Profile` roles and doctor specialties.

## API overview

- `POST /api/auth/register/`, `POST /api/auth/login/`, `GET /api/auth/me/`
- `PATCH /api/profile/` (updates only the authenticated user's profile)
- `GET /api/dashboard/`, `GET /api/doctors/`
- `GET /api/services/?lat=<latitude>&lng=<longitude>&radius_km=25` (authenticated, up to 100 km)
- `GET|POST /api/appointments/`; doctors can accept or reject assigned requests
- `GET|POST /api/health-records/`; records are scoped to their owner
- `GET|POST|PATCH|DELETE /api/availability/`; doctors manage their own time windows
- `GET|POST /api/chat/`; patient-owned conversations are persisted and private
- `GET /api/admin/users/?role=patient` and `GET /api/admin/activity/` (administrator only)

All API routes except registration and login require a DRF token in the `Authorization: Token <key>` header. Patient records and conversations are owner-scoped; doctors only see appointments assigned to them. Nearby search asks for browser location only after the user requests it; clinic/service locations are entered and maintained by an administrator. Use HTTPS, `DJANGO_DEBUG=false`, a production-grade secret, database backups and encryption, restricted CORS, monitoring, and an appropriately reviewed AI provider before deployment.

## Tests

```powershell
cd backend
py manage.py test
```

```powershell
cd frontend
npm run build
```
