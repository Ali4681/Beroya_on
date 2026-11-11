# Backend — Beroya Go

The API for Beroya On, built with NestJS. A single server process supports the customer and driver apps and the staff desk, providing ride management, dispatch, wallets, branches, monitoring, and real-time updates.

## Overview

| Property | Value |
| --- | --- |
| API prefix | `/api/v1/go` |
| Suggested local port | `8000` |
| API documentation | `/api/docs` when Swagger is enabled |
| Health check | `GET /api/v1/go/health` |
| Data store | PostgreSQL through Prisma 7 |
| Jobs and coordination | Redis and BullMQ |
| Real-time events | Socket.IO |

## Stack and requirements

- Node.js 20 or newer and npm.
- NestJS 11 and TypeScript.
- PostgreSQL; the default development database is `beroya_go`.
- Redis for queues, jobs, locks, and real-time coordination.
- Prisma 7 for schema management, migrations, and database access.

## Local setup

From the `Beroya-On-Backend` directory, create a local environment file:

```powershell
Copy-Item .env.example .env
```

Set `DATABASE_URL` and `DIRECT_URL` in `.env` to connect to your PostgreSQL instance. Set `PORT=8000` when running the backend alongside the frontend; `.env.example` defaults to port `3000`. Development defaults use `REDIS_MOCK=true` and `OTP_DEV_MODE=true`.

Install dependencies, apply migrations, and load development data:

```powershell
npm install
npx prisma migrate deploy
npm run seed
```

Start the API:

```powershell
npm run dev
```

Swagger is available at [http://localhost:8000/api/docs](http://localhost:8000/api/docs), and the health check is at [http://localhost:8000/api/v1/go/health](http://localhost:8000/api/v1/go/health). Swagger requires `SWAGGER_ENABLED=true`.

## Environment variables

Copy `.env.example` and update values for your environment. Do not commit `.env` files or production secrets.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Runtime environment. |
| `PORT` | HTTP port; use `8000` when running with the frontend. |
| `API_PREFIX` | Route prefix, defaulting to `api/v1/go`. |
| `CORS_ORIGINS` | Comma-separated list of allowed website origins. |
| `APP_PUBLIC_URL` | Public website origin used in tracking links. |
| `DATABASE_URL` | Application connection URL for PostgreSQL. |
| `DIRECT_URL` | Direct PostgreSQL connection used for Prisma migrations. |
| `PG_POOL_MAX` | Maximum PostgreSQL connection pool size. |
| `REDIS_MOCK`, `REDIS_URL` | Redis mode and connection URL. |
| `REDIS_KEY_PREFIX` | Redis key prefix; defaults to `go:`. |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Session token signing secrets; use strong values of at least 32 characters. |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL_DAYS` | Access and refresh token lifetimes. |
| `OTP_DEV_MODE`, `OTP_DEV_CODE` | Disable SMS and use a fixed development OTP. Turn development mode off in production. |
| `GOOGLE_MAPS_API_KEY` | Google Routes API key for route calculations. |
| `ROUTE_OSRM_URL` | OSRM fallback service for route calculations. |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | Firebase Cloud Messaging credentials. |
| `SWAGGER_ENABLED`, `SWAGGER_PATH` | Enable Swagger and set its path. |
| `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_PHONE` | Identity for the seeded super admin. |
| `SEED_DEFAULT_PASSWORD` | Password assigned to staff accounts created by the seed. |

### Redis in development

With `REDIS_MOCK=true`, the app tries `REDIS_URL` and can start the bundled Redis process under `.tools/redis` on Windows if Redis is unavailable. For multi-instance environments, use shared Redis and set `REDIS_MOCK=false`. BullMQ requires Redis to process queues.

## Seed data

`npm run seed` loads the baseline and sample data. The default password for seeded staff is `Beroya@12345`, unless `SEED_DEFAULT_PASSWORD` is set. In development mode, OTP verification accepts the code in `OTP_DEV_CODE` (default `123456`).

> **Warning:** Running `npm run seed` clears application tables before inserting sample data. Do not run it against a database containing important data.

## Authentication and branch scope

- Staff sign in with email or phone and password through `POST /auth/staff/login`.
- Customers and drivers request and verify a one-time password.
- Access tokens are short-lived JWTs; refresh tokens are managed and rotated by the server.
- `ADMIN` and `SUPER_ADMIN` roles can access all branches. Lists can be narrowed with `branch_id`.
- `OPERATIONS` and `FINANCE` accounts may be branch-scoped or global, depending on the account.
- Customer service, customer service supervisor, and wallet operator accounts require a branch.

Branch scope is enforced by the API. Hiding UI elements is not an authorization mechanism.

## Core domains

| Domain | Responsibility |
| --- | --- |
| Authentication | Staff, customer, and driver sessions; staff account management. |
| Rides and dispatch | Ride lifecycle, fares, driver offers, and scheduled rides. |
| Drivers and vehicles | Profiles, documents, eligibility, fleet, and active vehicles. |
| Customers | Customer profiles and operational data. |
| Wallets and finance | Balances, holds, settlements, compensation, and entitlements. |
| Branches and configuration | Branches, service areas, and dispatch settings. |
| Incidents and monitoring | Complaints, cases, emergencies, alerts, and monitoring. |
| Passport and discounts | Customer and driver levels, rules, and promotions. |
| Notifications and audit | Notification records and staff action history. |

## Request conventions

- The default route prefix is `/api/v1/go`.
- Request validation rejects unknown fields and transforms declared types.
- Errors include `statusCode`, `code`, `message`, `path`, `timestamp`, and `request_id`, and may include field-level errors.
- List endpoints use `page` and `limit`; the default maximum `limit` is 100.
- JSON request bodies are limited to 12 MB to support some base64 image uploads.
- Some write operations accept an `Idempotency-Key` to prevent duplicate effects when requests are retried.

## Real-time events and jobs

Available Socket.IO namespaces:

| Namespace | Client |
| --- | --- |
| `/go/customer` | Customer app. |
| `/go/driver` | Driver app. |
| `/go/staff` | Staff desk; pass the access token as `auth.token`. |

System, dispatch, scheduled ride, monitoring, Passport, discount, emergency, and notification jobs use BullMQ through Redis.

## Files, routing, and notifications

- Some driver documents and Passport icons are stored locally under `storage/`, which is excluded from Git, and served through protected routes.
- Route calculation uses Google Routes API when configured, then OSRM when configured, then a geometric fallback estimate.
- Push notifications use Firebase Cloud Messaging HTTP v1. When credentials are missing, deliveries are recorded as skipped.

## Project layout

```text
src/
├── main.ts                 # HTTP startup and request body limits
├── bootstrap.ts            # Prefix, CORS, validation, and error handling
├── config/                 # Environment schema and typed configuration
├── common/                 # Guards, permissions, scope, and errors
├── infra/                  # Prisma, Redis, BullMQ, and Socket.IO
├── modules/go/             # API domain modules
└── generated/prisma/       # Generated Prisma client; do not edit manually
prisma/
├── schema.prisma           # Database schema
├── migrations/             # Database migrations
└── seed.ts                 # Development data seeding
storage/                    # Uploaded files; not tracked by Git
```

After changing the Prisma schema, generate the client before building:

```powershell
npm run prisma:generate
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start development with automatic restarts. |
| `npm run build` | Apply migrations, generate Prisma client, and compile the app. |
| `npm start` | Run the compiled server from `dist/main.js`. |
| `npm run lint` | Run TypeScript checks without emitting files. |
| `npm test` | Run unit tests. |
| `npm run test:e2e` | Run end-to-end tests using the test configuration. |
| `npm run seed` | Reset and load development seed data. |
| `npm run prisma:migrate` | Create a migration during development. |
| `npm run prisma:deploy` | Apply committed migrations. |
| `npm run prisma:reset` | Reset and migrate the database. |
| `npm run swagger:export` | Export the OpenAPI schema. |

End-to-end tests require a separate test database configured in `.env.test`. Do not use the development database for these tests.

## Deployment

1. Create unique, strong JWT secrets and disable `OTP_DEV_MODE`.
2. Provide persistent PostgreSQL and Redis services. When using PgBouncer, use a direct `DIRECT_URL` for migrations.
3. Set `CORS_ORIGINS` to the frontend origins and `APP_PUBLIC_URL` to the public website address.
4. Configure map and FCM credentials if those features are required.
5. Apply committed migrations and run the app with production settings.

## Security and data

Do not store credentials or service keys in the repository. Apply appropriate access controls to PostgreSQL, Redis, and file storage, and back up persistent data. Use `npm run seed` only for development.

## License

This is a private project (`UNLICENSED`).
