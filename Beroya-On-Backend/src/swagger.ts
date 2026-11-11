import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { CURRENT_PHASE } from './modules/go/system/system.controller';

const DESCRIPTION = `
Beroya On backend API.

**Base URL:** \`/api/v1/go\` — split by client: \`/customer/*\`, \`/driver/*\`, \`/erp/*\` (staff dashboards), \`/admin/*\`, plus shared \`/auth/*\`, \`/meta/*\`, \`/health\`.

**Auth:** \`Authorization: Bearer <access_token>\`. Access token lives \`expires_in\` seconds; renew with \`POST /auth/refresh\` (refresh token rotates every time).

**Errors:** every non-2xx body is \`{ statusCode, code, message, ...extra, path, timestamp, request_id }\`. Branch on \`code\` (see \`GET /meta/error-codes\`).

**Idempotency:** endpoints that show an \`Idempotency-Key\` header require a unique key per operation; retries must reuse it.

**Realtime:** Socket.IO namespaces \`/go/customer\`, \`/go/driver\`, \`/go/staff\`, connect with \`{ auth: { token: '<access_token>' } }\`.

**Driver socket (\`/go/driver\`) — home screen:**
- \`driver.forced_offline\` → \`{ "reason": "WALLET_DUE" }\` — currently the only emitted reason (wallet due / commission shortfall). Show snackbar and set availability OFFLINE.
- \`wallet.updated\` → **same JSON shape as** \`GET /driver/wallet\` (\`balance\`, \`available_balance\`, \`outstanding_due\`, \`last_commission_deduction\`, \`low_balance\`, \`estimated_remaining_rides\`). Refresh the balance chip.
- \`wallet.low_balance\` → same wallet view fields (low-balance warning).
- \`eligibility.updated\` → re-fetch \`GET /driver/eligibility\` before offering online.
- \`notification.created\` → new inbox row (same item shape as \`GET /driver/notifications\` items).

**Field naming:** snake_case everywhere. Money = number in SYP. Timestamps = ISO-8601 UTC.
`.trim();

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Beroya On API')
    .setDescription(DESCRIPTION)
    .setVersion(`0.1.0 (${CURRENT_PHASE})`)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addServer('http://localhost:3000', 'Local')
    .addTag('Auth', 'Login (OTP for Customer/Driver, password for Staff), tokens, sessions')
    .addTag('System', 'Health')
    .addTag('Meta', 'Error codes and enums for clients')
    .addTag('Customer', 'Customer app — /customer/*')
    .addTag('Driver', 'Driver app — /driver/*')
    .addTag('ERP', 'Staff dashboards (CS, Supervisor, Operations, Wallet, Finance) — /erp/*')
    .addTag('Admin', 'Admin dashboard — /admin/*')
    .build();
  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

export function setupSwagger(app: INestApplication, path: string): OpenAPIObject {
  const document = buildSwaggerDocument(app);
  SwaggerModule.setup(path, app, document, {
    jsonDocumentUrl: `${path}-json`,
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha', operationsSorter: 'alpha' },
    customSiteTitle: 'Beroya On API',
  });
  return document;
}
