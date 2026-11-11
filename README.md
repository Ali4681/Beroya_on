# Beroya On

<p align="center">
  <strong>An integrated digital platform for mobility and operations</strong><br />
  A public website, operations and administration desk, and a shared API for customer and driver apps.
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16.3-black?logo=next.js" />
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-Database-4169e1?logo=postgresql&logoColor=white" />
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-7-2d3748?logo=prisma&logoColor=white" />
</p>

Beroya On is split into a web application and a backend API. The web app serves the public website and staff desk. The backend provides rides, customer and driver services, financial operations, and real-time updates.

## Repository contents

| Path | Description |
| --- | --- |
| [`frontend/`](frontend/README.md) | Arabic and English public website and staff desk built with Next.js. |
| [`Beroya-On-Backend/`](Beroya-On-Backend/README.md) | NestJS API backed by PostgreSQL, Prisma, Redis, and Socket.IO. |
| [`docs/FLUTTER_BRANDING.md`](docs/FLUTTER_BRANDING.md) | Branding and visual identity integration guide for the Flutter apps. |

> The Flutter app is maintained in a separate project. Its mobile clients integrate with the backend in this repository.

## Architecture

```text
Browser ──> Next.js :3000 ──> /api/proxy ──> NestJS :8000
                                              ├── PostgreSQL
                                              ├── Redis / BullMQ
                                              └── Socket.IO
```

Staff desk REST requests pass through the Next.js proxy, so the browser does not need to call the API origin directly or configure CORS for REST. The browser connects directly to the backend for Socket.IO, so add the frontend origin to `CORS_ORIGINS`.

## Requirements

- Node.js 20 or newer and npm.
- PostgreSQL; the default development database is named `beroya_go`.
- Redis for queues, jobs, and coordination. Development settings can start a local Redis process automatically on Windows when needed.
- Git to clone the repository.

## Run locally

### 1. Configure the backend

```powershell
cd Beroya-On-Backend
Copy-Item .env.example .env
```

Set `DATABASE_URL` and `DIRECT_URL` in `.env` to match your local PostgreSQL setup. Use port `8000` to match the frontend defaults. Then run:

```powershell
npm install
npx prisma migrate deploy
npm run seed
npm run dev
```

### 2. Configure the frontend

In a second terminal:

```powershell
cd frontend
```

Create a `.env.local` file with these values:

```env
API_URL=http://localhost:8000
NEXT_PUBLIC_API_URL=/api/proxy
NEXT_PUBLIC_API_PREFIX=
NEXT_PUBLIC_APP_NAME=Beroya On
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SOCKET_URL=http://localhost:8000
API_TIMEOUT_MS=15000
PORT=3000
```

Start the app:

```powershell
npm install
npm run dev
```

### 3. Open the application

- Public website: [http://localhost:3000](http://localhost:3000) — `/` redirects to Arabic or English.
- Staff sign-in: [http://localhost:3000/login](http://localhost:3000/login).
- API docs: [http://localhost:8000/api/docs](http://localhost:8000/api/docs), when Swagger is enabled.
- API health check: [http://localhost:8000/api/v1/go/health](http://localhost:8000/api/v1/go/health).

After seeding, sign in with the admin account `admin@beroyaon.com` and default password `Beroya@12345`, unless `SEED_DEFAULT_PASSWORD` has been changed. These credentials are for development only; change them before using a shared environment.

## Development commands

Run each command from the corresponding application directory:

| App | Command | Purpose |
| --- | --- | --- |
| Frontend | `npm run dev` | Start the Next.js development server. |
| Frontend | `npm run build` | Create a production build. |
| Frontend | `npm run start` | Serve the production build. |
| Frontend | `npm run lint` | Run ESLint. |
| Backend | `npm run dev` | Run NestJS with automatic restarts. |
| Backend | `npm run build` | Apply migrations, generate Prisma, and compile TypeScript. |
| Backend | `npm start` | Run the compiled server. |
| Backend | `npm run lint` | Run TypeScript checks without emitting files. |
| Backend | `npm test` | Run unit tests. |
| Backend | `npm run test:e2e` | Run end-to-end tests; requires a separate test database. |

## Important notes

- Do not commit `.env` files, secrets, or service keys.
- The backend's `npm run seed` resets application tables before inserting sample data. Do not run it against a database containing important data.
- Use a separate database for end-to-end tests; do not point them at the development database.
- Changes to `NEXT_PUBLIC_*` variables require a new frontend build because their values are embedded at build time.
- See each application README for detailed configuration, routes, and operational guidance.

## License

This is a private project (`UNLICENSED`).
