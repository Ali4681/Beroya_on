# Frontend — Beroya On

A single Next.js application with both the public website and the staff operations desk. The website supports Arabic (RTL) and English (LTR). The staff desk uses authenticated sessions and role-based access backed by the Beroya Go API.

## Overview

| Area | Routes | Purpose |
| --- | --- | --- |
| Public website | `/ar`, `/en` | Localized landing pages and service information. |
| Status | `/ar/status`, `/en/status` | Backend connectivity status. |
| Sign-in | `/login` | Staff authentication. |
| Operations and administration | `/erp/*`, `/admin/*` | Rides, customers, drivers, finance, and operational settings. |
| API proxy | `/api/proxy/*` | Forwards browser requests to the server-side `API_URL`. |

When a visitor opens `/`, the app selects a locale using the `NEXT_LOCALE` cookie, then the `Accept-Language` header, and falls back to Arabic. Staff REST requests do not connect directly to the API origin; Socket.IO connects from the browser to the backend.

## Technology stack

| Technology | Use |
| --- | --- |
| Next.js 16 and React 19 | App Router, rendering, and UI components. |
| TypeScript | Static typing and build-time checks. |
| Tailwind CSS 4 | Styling and design tokens. |
| TanStack Query 5 | Staff desk data fetching and caching. |
| Zod 4 | Environment and input validation. |
| Leaflet | Maps and service areas. |
| Socket.IO Client | Real-time staff events. |

Requires Node.js 20 or newer.

## Getting started

First, start the backend at `http://localhost:8000`. See the [backend guide](../Beroya-On-Backend/README.md) for setup instructions.

From the `frontend` directory, install dependencies:

```powershell
npm install
```

Create `.env.local` in this directory:

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

Start the development server:

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Staff can sign in at `/login` with an account created by the backend seed. The development admin account is `admin@beroyaon.com` with password `Beroya@12345`.

## Environment variables

| Variable | Local value | Description |
| --- | --- | --- |
| `API_URL` | `http://localhost:8000` | Backend API origin, used by the server-side proxy and not exposed to the browser. |
| `NEXT_PUBLIC_API_URL` | `/api/proxy` | Base path for browser REST requests. Keep it on the local proxy path. |
| `NEXT_PUBLIC_API_PREFIX` | Empty | Optional prefix added to client paths. Leave empty because staff paths already include `/api/v1/go`. |
| `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:8000` | Socket.IO origin; the client connects to the `/go/staff` namespace. |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Absolute site URL used in metadata. |
| `NEXT_PUBLIC_APP_NAME` | `Beroya On` | Brand name shown on the website. |
| `API_TIMEOUT_MS` | `15000` | API request timeout in milliseconds. |
| `PORT` | `3000` | Next.js server port. |

`NEXT_PUBLIC_*` values are embedded in browser bundles at build time. Rebuild after changing them in production. Never put secrets in these variables.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Build for production. |
| `npm run start` | Run the production build. |
| `npm run lint` | Run ESLint. |

## Source layout

```text
src/
├── app/                 # Website, desk routes, and API proxy
├── application/         # Website, health, and sign-in use cases
├── core/                # Environment, locale, and website dictionaries
├── domain/              # Core entities and interfaces
├── features/
│   ├── desk/            # Staff UI, navigation, forms, and API client
│   └── landing/         # Public website sections
├── infrastructure/      # Repository and service implementations
└── shared/              # Shared components, utilities, and theme
```

Useful files:

- `src/features/desk/nav.ts`: staff navigation and role visibility.
- `src/features/desk/hooks.ts`: desk data hooks, including branch filtering.
- `src/features/desk/messages.ts`: Arabic API error messages.
- `src/features/desk/i18n/en.json`: English staff desk strings.
- `src/core/i18n/dictionaries/`: Arabic and English website dictionaries.
- `src/features/landing/landing-page.tsx`: public landing page section order.
- `src/app/globals.css`: global styles and color tokens.

## Staff desk data flow

```text
Desk screen → hooks.ts → go-api.ts → /api/proxy/* → API_URL
```

The session is stored in `localStorage`. The client sends the access token in the `Authorization` header and retries token refresh once after a `401` response. Desk lists use TanStack Query, and Socket.IO events invalidate cached data and display staff notifications.

The desk supports branch selection, but available branches and operations depend on the account role and backend permissions. Review backend authorization when changing roles.

## Deployment

Set `NEXT_PUBLIC_SITE_URL` to the public site origin, `API_URL` to the backend origin, and `NEXT_PUBLIC_SOCKET_URL` to the server origin that accepts Socket.IO connections. Add the site origin to the backend's `CORS_ORIGINS`, then rebuild after changing any `NEXT_PUBLIC_*` variable.

## Mobile app

The Flutter app is maintained in a separate repository. See [`docs/FLUTTER_BRANDING.md`](../docs/FLUTTER_BRANDING.md) for its branding and integration reference.
