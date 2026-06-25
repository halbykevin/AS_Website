# AS Store — Backend API (Express + PostgreSQL)

The store's own API. Connects to the **`as_store`** database, handles admin login, serves the
product catalog, and stores uploaded images. Separate from the marketing site's `server/` so the
shop stays decoupled. Runs on **port 8081** (the marketing API uses 8080).

```
AS Store (Next.js, :5180) ──► this API (:8081) ──► PostgreSQL (as_store)
Admin CMS (later)         ──┘                       └── /uploads (images on disk)
```

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | — | Liveness check |
| POST | `/api/auth/login` | — | Admin login → `{ token }` |
| GET | `/api/auth/me` | admin | Current admin |
| GET | `/api/categories` | — | Visible categories (`?all=1` + auth → include hidden) |
| POST/PUT/DELETE | `/api/categories[/:id]` | admin | Manage categories |
| GET | `/api/products` | — | List. Filters: `?category=slug`, `?featured=1`, `?search=`, `?limit=` (`?all=1` + auth → include hidden) |
| GET | `/api/products/:slug` | — | One product + image gallery |
| POST/PUT/DELETE | `/api/products[/:id]` | admin | Manage products |
| POST | `/api/products/:id/images` | admin | Add an image URL to a product |
| DELETE | `/api/products/:id/images/:imageId` | admin | Remove a product image |
| POST | `/api/uploads` | admin | Upload an image file → `{ url }` |

Responses are **camelCase**; DB columns are snake_case (mapped in `src/app.js`).

## Run locally

```bash
cd as_store/server
cp .env.example .env      # set DATABASE_URL (postgres://postgres:PASSWORD@127.0.0.1:5432/as_store)
npm install
npm run migrate           # optional — re-applies db/schema.sql (already run via pgAdmin)
npm run seed              # optional — re-loads db/seed.sql
npm start                 # http://localhost:8081
```

Quick check: http://localhost:8081/api/health → `{"ok":true}`.

## Env (`.env`)

`DATABASE_URL` · `PORT` (8081) · `PUBLIC_URL` (builds uploaded image URLs) · `UPLOAD_DIR` ·
`CORS_ORIGIN` (storefront 5180 + admin 5173) · `ADMIN_EMAIL` / `ADMIN_PASSWORD` · `JWT_SECRET`.
