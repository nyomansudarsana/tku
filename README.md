# Tech Kiosk Ubud (TKU) — Management System

A full-stack inventory and sales management system for Tech Kiosk Ubud.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python · FastAPI · SQLAlchemy · SQLite |
| Auth | JWT (python-jose) · bcrypt (passlib) |
| Frontend | React (Vite) · Tailwind CSS v4 · Recharts |
| Charts | Recharts |

---

## Project Structure

```
TKU/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI application entry point
│   │   ├── config.py        # Settings from .env
│   │   ├── database.py      # SQLAlchemy engine + session
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── routers/         # API route handlers
│   │   ├── services/        # Business logic (auth, inventory)
│   │   └── utils/           # Security helpers
│   ├── seed.py              # Database seed script
│   ├── requirements.txt
│   └── .env
└── frontend/
    ├── src/
    │   ├── api/             # Axios API client + endpoints
    │   ├── context/         # React contexts (AuthContext)
    │   ├── components/      # Shared UI components
    │   ├── pages/           # Page components
    │   └── utils/           # Formatting helpers
    ├── vite.config.js
    └── package.json
```

---

## Installation

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm 9+

---

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (macOS/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Seed the database
python seed.py

# Start the server
uvicorn app.main:app --reload --port 8000
```

Backend will be running at: http://localhost:8000

API Docs: http://localhost:8000/docs

---

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Frontend will be running at: http://localhost:3000

---

## Default Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Admin |
| staff1 | staff123 | Staff |

---

## API Endpoints

| Module | Base URL |
|--------|----------|
| Authentication | `/api/v1/auth` |
| Users | `/api/v1/users` |
| Suppliers | `/api/v1/suppliers` |
| Categories | `/api/v1/categories` |
| Products | `/api/v1/products` |
| Warehouses | `/api/v1/warehouses` |
| Stores | `/api/v1/stores` |
| Receiving | `/api/v1/receivings` |
| Inventory | `/api/v1/inventories` |
| Stock Movement | `/api/v1/stock-movements` |
| Sales | `/api/v1/sales` |
| Dashboard | `/api/v1/dashboard` |

Full interactive docs: http://localhost:8000/docs

---

## Features

### Authentication
- JWT-based login/logout
- bcrypt password hashing
- Role-based access (Admin / Manager / Staff)
- Change password + admin password reset

### Dashboard
- Daily & monthly sales KPIs
- Sales trend chart (30 days)
- Top selling products
- Sales by category (pie chart)
- Sales by store
- Sales by payment method
- Outstanding (unpaid) sales list
- Stock status summary

### Master Data
- Suppliers (CRUD, search, pagination, soft delete)
- Product Categories (CRUD)
- Products (CRUD, category filter, status filter)
- Warehouses (CRUD)
- Stores (CRUD)

### Receiving (Inbound)
- Record goods received from suppliers
- Accepted / Rejected quantity tracking
- Auto-validates: received = accepted + rejected

### Inventory
- Allocate products to warehouses
- Inventory types: TKU Product / Consignment / Titip Jual
- Stock status badges: In Stock / Low Stock / Out of Stock

### Stock Movement
- Types: IN / OUT / TRANSFER / ADJUSTMENT
- Automatic inventory balance update
- Inventory ledger history

### Sales
- Dynamic payment form (Bank Transfer → account fields; EDC → receipt/code fields)
- Auto-calculated subtotal and grand total
- Payment status: Paid / Unpaid / Partial
- Filters: store, payment method, payment status

### User Management (Admin only)
- Create / Edit / Deactivate users
- Role assignment (Admin / Manager / Staff)
- Password reset by admin

---

## Database Schema (Key Tables)

All master and transaction tables include audit columns:
`created_by`, `created_at`, `modified_by`, `modified_at`, `deleted_by`, `deleted_at`

Soft delete is implemented via `deleted_at IS NULL` filter in all queries.

### Tables
- `users` — system users
- `suppliers` — supplier master
- `categories` — product categories
- `products` — product catalog
- `warehouses` — warehouse locations
- `stores` — store locations
- `receivings` — inbound goods records
- `inventories` — current stock per product/warehouse
- `stock_movements` — all stock changes
- `sales` — sales transactions
- `payments` — payment records (separate from sales)
- `inventory_ledger` — complete stock history
- `supplier_products` — supplier-product mapping

---

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for full step-by-step instructions.

**Summary:**
- Backend → [Hugging Face Spaces](https://huggingface.co/spaces) (Docker SDK, port 7860, SQLite at `/data/tku.db`)
- Frontend → [Vercel](https://vercel.com) (auto-deploy from GitHub, SPA routing via `vercel.json`)

Environment variables to configure:
- Backend: `SECRET_KEY`, `ALLOWED_ORIGINS`, `DATABASE_URL`, `DEBUG`
- Frontend: `VITE_API_BASE_URL` (full URL to HF Space + `/api/v1`)

---

## Future Scalability

1. **Database**: Migrate SQLite → PostgreSQL for production
2. **Auth**: Add OAuth2/SSO, refresh token rotation
3. **RBAC**: Implement granular permission table
4. **Multi-tenant**: Add branch/company isolation
5. **Reporting**: PDF/Excel export for all reports
6. **Notifications**: Low stock alerts via email/WhatsApp
7. **Barcode**: Barcode scanner integration for receiving/sales
8. **Mobile**: React Native or PWA for mobile staff
9. **API rate limiting**: Add rate limiter middleware
10. **Background jobs**: Celery + Redis for async tasks
