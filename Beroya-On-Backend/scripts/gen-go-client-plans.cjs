/**
 * Generate Beroya Go FRONTEND-PLAN.md + MOBILE-PLAN.md in Shuttle §15.2 style.
 * Usage: node backend/scripts/gen-go-client-plans.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SWAGGER = path.join(ROOT, 'docs', 'swagger.json');
const ERRORS_SRC = path.join(ROOT, 'src', 'common', 'errors', 'go-error-codes.ts');

const spec = JSON.parse(fs.readFileSync(SWAGGER, 'utf8'));

function resolveRef(ref) {
  if (!ref?.startsWith('#/')) return null;
  let cur = spec;
  for (const p of ref.slice(2).split('/')) cur = cur?.[p];
  return cur ?? null;
}

/** Fully normalize OpenAPI schema for docs (enums via allOf, nullable strings, etc.). */
function deref(schema, depth = 0) {
  if (!schema || depth > 10) return schema;
  if (schema.$ref) return deref(resolveRef(schema.$ref), depth + 1);

  if (schema.allOf?.length) {
    if (schema.allOf.length === 1) {
      const only = deref(schema.allOf[0], depth + 1);
      return mergeNullable(only, schema);
    }
    const merged = { type: 'object', properties: {}, required: [] };
    for (const part of schema.allOf) {
      const d = deref(part, depth + 1) || {};
      if (d.properties) Object.assign(merged.properties, d.properties);
      if (d.required) merged.required.push(...d.required);
      if (d.enum && !merged.enum) {
        return mergeNullable({ type: d.type || 'string', enum: d.enum, description: d.description }, schema);
      }
    }
    return mergeNullable(merged, schema);
  }

  if (schema.oneOf?.length === 1) return mergeNullable(deref(schema.oneOf[0], depth + 1), schema);
  if (schema.anyOf?.length === 1) return mergeNullable(deref(schema.anyOf[0], depth + 1), schema);

  // Nest often emits nullable string as { type: 'object', nullable: true } with no props
  if (
    schema.nullable &&
    (schema.type === 'object' || !schema.type) &&
    !schema.properties &&
    !schema.enum &&
    !schema.items
  ) {
    return {
      type: 'string',
      nullable: true,
      description: schema.description,
      example: schema.example ?? null,
    };
  }

  const out = { ...schema };
  if (out.properties) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, deref(v, depth + 1)]),
    );
  }
  if (out.items) out.items = deref(out.items, depth + 1);
  return out;
}

function mergeNullable(inner, outer) {
  if (!inner) return inner;
  const o = { ...inner };
  if (outer.nullable) o.nullable = true;
  if (outer.description && !o.description) o.description = outer.description;
  if (outer.example !== undefined && o.example === undefined) o.example = outer.example;
  return o;
}

function typeLabel(schema) {
  schema = deref(schema) || {};
  if (schema.enum) {
    const base = `enum(${schema.enum.join(' | ')})`;
    return schema.nullable ? `${base} | null` : base;
  }
  if (schema.type === 'array') {
    const it = deref(schema.items) || {};
    const item =
      it.enum ? `enum(${it.enum.join('|')})` : it.type || it.$ref?.split('/').pop() || 'any';
    return schema.nullable ? `array<${item}> | null` : `array<${item}>`;
  }
  let t = schema.type || 'any';
  if (schema.format) t += ` (${schema.format})`;
  if (schema.nullable) t += ' | null';
  return t;
}

function sampleFor(schema, depth = 0) {
  schema = deref(schema);
  if (!schema || depth > 8) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.nullable && depth > 0 && Math.random() < 0) return null; // keep deterministic
  if (schema.enum) return schema.enum[0];
  if (schema.type === 'string') {
    if (schema.format === 'uuid') return '11111111-1111-4111-8111-111111111111';
    if (schema.format === 'date-time') return '2026-10-05T09:00:00.000Z';
    if (schema.format === 'email') return 'admin@beroyaon.com';
    if (schema.nullable) return null;
    return 'string';
  }
  if (schema.type === 'number' || schema.type === 'integer') return schema.minimum ?? 1;
  if (schema.type === 'boolean') return true;
  if (schema.type === 'array') {
    const item = sampleFor(schema.items, depth + 1);
    return item === undefined ? [] : [item];
  }
  if (schema.type === 'object' || schema.properties) {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties || {})) {
      out[k] = sampleFor(v, depth + 1);
    }
    return out;
  }
  if (schema.nullable) return null;
  return null;
}

function fieldDocs(schema, indent = '') {
  schema = deref(schema);
  if (!schema) return `${indent}لا يوجد\n`;

  if (schema.enum || (schema.type && schema.type !== 'object' && schema.type !== 'array' && !schema.properties)) {
    return `${indent}${typeLabel(schema)}\n`;
  }

  if (schema.type === 'array') {
    return `${indent}array — عناصر:\n${fieldDocs(schema.items, indent + '  ')}`;
  }

  if (!(schema.properties || schema.type === 'object')) {
    return `${indent}${typeLabel(schema)}\n`;
  }

  const req = new Set(schema.required || []);
  let out = '{\n';
  for (const [k, v] of Object.entries(schema.properties || {})) {
    const d = deref(v) || {};
    const reqLabel = req.has(k) ? 'إلزامي' : 'اختياري';
    const desc = d.description ? ` — ${d.description}` : '';
    if (d.enum || (d.type && d.type !== 'object' && d.type !== 'array' && !d.properties)) {
      out += `${indent}  ${k}: ${typeLabel(d)} — ${reqLabel}${desc}\n`;
    } else if (d.type === 'array') {
      out += `${indent}  ${k}: ${typeLabel(d)} — ${reqLabel}${desc}\n`;
      const it = deref(d.items);
      if (it?.properties) {
        out += fieldDocs(it, indent + '  ');
      }
    } else if (d.properties || d.type === 'object') {
      out += `${indent}  ${k}: object${d.nullable ? ' | null' : ''} — ${reqLabel}${desc}\n`;
      if (d.properties) out += fieldDocs(d, indent + '  ');
      else if (d.nullable) out += `${indent}    (nullable بدون حقول فرعية في OpenAPI)\n`;
    } else {
      out += `${indent}  ${k}: ${typeLabel(d)} — ${reqLabel}${desc}\n`;
    }
  }
  out += `${indent}}\n`;
  return out;
}

function groupForPath(p) {
  if (p.includes('/auth/')) return 'auth';
  if (p.includes('/admin/')) return 'admin';
  if (p.includes('/erp/')) return 'erp';
  if (p.includes('/customer/')) return 'customer';
  if (p.includes('/driver/')) return 'driver';
  if (
    p.includes('/meta/') ||
    p.includes('/app/') ||
    p.includes('/public/') ||
    p.includes('/media/') ||
    p.startsWith('/t/') ||
    p === '/api/v1/go/health'
  ) {
    return 'system';
  }
  return 'other';
}

function roleHint(tags = [], p = '') {
  if (p.includes('/customer/') || tags.includes('Customer')) return 'CUSTOMER';
  if (p.includes('/driver/') || tags.includes('Driver')) return 'DRIVER';
  if (p.includes('/admin/') || tags.includes('Admin')) return 'ADMIN | SUPER_ADMIN';
  if (p.includes('/erp/') || tags.includes('ERP')) {
    return 'CUSTOMER_SERVICE | CUSTOMER_SERVICE_SUPERVISOR | OPERATIONS | WALLET_OPERATOR | FINANCE | ADMIN | SUPER_ADMIN (حسب المسار)';
  }
  if (tags.includes('Auth') || p.includes('/auth/')) return 'PUBLIC أو أي دور مصادق حسب المسار';
  return tags[0] || '—';
}

function screenHint(p, method) {
  if (p.includes('/auth/otp')) return 'تسجيل الدخول OTP';
  if (p.includes('/auth/staff')) return 'تسجيل دخول الموظفين';
  if (p.includes('/auth/')) return 'الجلسة / الحساب';
  if (p.includes('/customer/rides') && method === 'post' && !p.includes('/')) return 'طلب رحلة';
  if (p.endsWith('/customer/rides') && method === 'post') return 'طلب رحلة';
  if (p.includes('/customer/rides/active')) return 'الرحلة الحية';
  if (p.includes('/customer/passport')) return 'جواز العميل';
  if (p.includes('/customer/discount')) return 'أكواد الخصم';
  if (p.includes('/saved-places')) return 'الأماكن المحفوظة';
  if (p.includes('/notifications') || p.includes('/push-token')) return 'الإشعارات';
  if (p.includes('/messages')) return 'دردشة الرحلة';
  if (p.includes('/customer/wallet')) return 'محفظة العميل';
  if (p.includes('/customer/profile') || p.includes('/customer/account')) return 'حساب العميل';
  if (p.includes('/customer/services') || p.includes('/customer/packages') || p.includes('/customer/cities')) return 'الرئيسية / الكتالوج';
  if (p.includes('/app/')) return 'الهوية وإصدار التطبيق';
  if (p.includes('/public/track')) return 'رابط التتبع العام';
  if (p.includes('/driver/radar')) return 'رادار السائق';
  if (p.includes('/driver/incentives')) return 'حوافز السائق';
  if (p.includes('/driver/offers')) return 'عروض الرحلات';
  if (p.includes('/driver/wallet')) return 'محفظة السائق';
  if (p.includes('/driver/location')) return 'موقع السائق';
  if (p.includes('/erp/rides/live')) return 'لوحة الرحلات الحية';
  if (p.includes('/erp/alerts')) return 'صندوق التنبيهات';
  if (p.includes('/erp/emergencies')) return 'الطوارئ';
  if (p.includes('/erp/wallets')) return 'شحن المحفظة';
  if (p.includes('/admin/')) return 'لوحة الإدارة';
  return 'شاشة عامة';
}

function enrichEmptyResponseNote(fullPath, method) {
  // Known return shapes when OpenAPI lacks response schema
  if (fullPath.includes('/erp/rides/live')) {
    return `{ data: array<object> — رحلات حية (قد يكون المصفوفة مباشرة حسب التنفيذ) }
مثال:
\`\`\`json
[
  {
    "id": "11111111-1111-4111-8111-111111111111",
    "status": "IN_PROGRESS",
    "driver_id": "22222222-2222-4222-8222-222222222222",
    "customer_id": "33333333-3333-4333-8333-333333333333"
  }
]
\`\`\`
`;
  }
  return `نجاح — مخطط الاستجابة غير مُعلَّن في OpenAPI لهذا المسار؛ اعتمد على الحقول الظاهرة في الشاشات/التدفقات أو اختبار e2e، وحدّث الـ DTO في الباك ثم أعد التوليد.\n`;
}

function renderEndpoint(fullPath, method, op) {
  const title = op.summary || op.operationId || `${method.toUpperCase()} ${fullPath}`;
  const params = op.parameters || [];
  const pathParams = params.filter((x) => x.in === 'path');
  const queryParams = params.filter((x) => x.in === 'query');

  let pathLine = 'لا يوجد';
  if (pathParams.length) {
    pathLine = pathParams
      .map((p) => {
        const sch = deref(p.schema) || {};
        return `:${p.name} — ${p.description || typeLabel(sch)}`;
      })
      .join('؛ ');
  }
  let queryLine = 'لا يوجد';
  if (queryParams.length) {
    queryLine = queryParams
      .map((p) => {
        const sch = deref(p.schema) || {};
        const opt = p.required ? '' : '?';
        return `${p.name}${opt} (${typeLabel(sch)})`;
      })
      .join(', ');
  }

  const bodySchema = op.requestBody?.content?.['application/json']?.schema;
  let bodyBlock = 'لا يوجد\n';
  let bodyExample = '';
  if (bodySchema) {
    bodyBlock = fieldDocs(bodySchema);
    bodyExample = JSON.stringify(sampleFor(bodySchema), null, 2);
  }

  const responses = op.responses || {};
  let responseBlocks = '';
  const errorLines = [];
  for (const [code, resp] of Object.entries(responses)) {
    const schema = resp.content?.['application/json']?.schema;
    if (String(code).startsWith('2')) {
      responseBlocks += `Response ${code}:\n`;
      if (schema) {
        responseBlocks += fieldDocs(schema);
        responseBlocks += `مثال:\n\`\`\`json\n${JSON.stringify(sampleFor(schema), null, 2)}\n\`\`\`\n\n`;
      } else if (resp.description) {
        responseBlocks += `${resp.description}\n\n`;
      } else {
        responseBlocks += enrichEmptyResponseNote(fullPath, method) + '\n';
      }
    } else {
      const desc = (resp.description || '').replace(/\n/g, ' ');
      errorLines.push(`${code} ${desc || 'ErrorResponseDto'}`);
    }
  }
  if (!responseBlocks) {
    responseBlocks = `Response 200:\n${enrichEmptyResponseNote(fullPath, method)}\n`;
  }

  const notes = [];
  if (op.description) notes.push(op.description.replace(/\n/g, ' '));
  if (
    ['post', 'patch', 'put', 'delete'].includes(method) &&
    /rides|wallet|compensation|replacement|emergency|top-up|reverse/i.test(fullPath)
  ) {
    notes.push('قد يتطلب رأس `Idempotency-Key` على العمليات الحساسة.');
  }
  notes.push('الفرع على `code` في خطأ `ErrorResponseDto` وليس على `message`.');

  return `### ${title}
${method.toUpperCase()} ${fullPath}

الدور المسموح: ${roleHint(op.tags, fullPath)}
يُستخدم في الشاشة: ${screenHint(fullPath, method)}

Path params:   ${pathLine}
Query params:  ${queryLine}

Request body:
${bodyBlock}${bodyExample ? `\nمثال:\n\`\`\`json\n${bodyExample}\n\`\`\`\n` : ''}
${responseBlocks}Errors:
${errorLines.length ? errorLines.map((e) => `- ${e}`).join('\n') : '- انظر جدول أخطاء GoErrorCode في أعلى الملف'}

ملاحظات: ${notes.join(' ')}

`;
}

function collectOps(predicate) {
  const ops = [];
  for (const [p, methods] of Object.entries(spec.paths || {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      if (!predicate(p, method, op)) continue;
      ops.push({ p, method, op, group: groupForPath(p) });
    }
  }
  const order = ['auth', 'customer', 'driver', 'erp', 'admin', 'system', 'other'];
  ops.sort((a, b) => {
    const ga = order.indexOf(a.group);
    const gb = order.indexOf(b.group);
    if (ga !== gb) return ga - gb;
    return a.p.localeCompare(b.p) || a.method.localeCompare(b.method);
  });
  return ops;
}

function renderApiSection(ops) {
  let md = '';
  let current = '';
  for (const { p, method, op, group } of ops) {
    if (group !== current) {
      current = group;
      md += `\n## مجموعة \`${group}\`\n\n`;
    }
    md += renderEndpoint(p, method, op);
  }
  return md;
}

function parseErrorCodes() {
  const src = fs.readFileSync(ERRORS_SRC, 'utf8');
  const codes = [...src.matchAll(/([A-Z0-9_]+)\s*=\s*'([A-Z0-9_]+)'/g)].map((m) => m[2]);
  const statusMap = {};
  const statusBlock = src.match(/GO_ERROR_HTTP_STATUS[\s\S]*?};/);
  if (statusBlock) {
    for (const m of statusBlock[0].matchAll(/GoErrorCode\.([A-Z0-9_]+)\].*?HttpStatus\.([A-Z_]+)/g)) {
      statusMap[m[1]] = m[2];
    }
  }
  return { codes, statusMap };
}

const { codes: ERROR_CODES, statusMap } = parseErrorCodes();

function errorTableMd() {
  let md = `| code | HTTP (تقريبي) | سلوك الواجهة |\n|---|---|---|\n`;
  for (const c of ERROR_CODES) {
    const http = statusMap[c] || '—';
    md += `| \`${c}\` | ${http} | اعرض رسالة مترجمة حسب \`code\`؛ لا تعتمد على message |\n`;
  }
  return md;
}

const FRONTEND_PREAMBLE = `# FRONTEND_PLAN — لوحة Beroya Go (ERP / Admin)

عقد واحد لفريق Next.js لـ **Beroya Go** (ليس Shuttle). أي تغيير على API الباك يُحدَّث هنا في نفس الـ PR.

**Base path:** \`/api/v1/go\` · **OpenAPI:** [\`swagger.json\`](./swagger.json)

> عقد واحد في هذا الملف. قسم API يُحدَّث عبر \`npm run docs:gen-go-plans\` (يحافظ على أقسام الشاشات/التدفقات بين العلامات).

## 1. فكرة المنتج

Beroya Go منصة طلب مشاوير (ride-hailing): عميل يطلب رحلة فورية أو مجدولة، سائق يستقبل عروضاً، وموظفون (ERP/Admin) يديرون التشغيل الحي، الشكاوى، الطوارئ، الحوادث، المحفظة، الجواز، والخصومات.

أدوار الويب الثابتة (\`GoRole\`): \`CUSTOMER_SERVICE\`، \`CUSTOMER_SERVICE_SUPERVISOR\`، \`OPERATIONS\`، \`WALLET_OPERATOR\`، \`FINANCE\`، \`ADMIN\`، \`SUPER_ADMIN\`. لا مصفوفة صلاحيات ديناميكية.

الدفع في V1: **CASH فقط**. لا Sham Cash في الواجهة.

## 2. قواعد ملزمة للواجهة

| الدور | مسموح | ممنوع |
|---|---|---|
| CS / CSSUP | رحلات حية، تنبيهات، شكاوى، طوارئ (تشغيل)، تواصل مفحوص | تعديل تسعير/فروع بدون Admin؛ تشغيل تسجيل طوارئ محفوظ (CSSUP فقط للتشغيل/حذف) |
| OPERATIONS | رحلات، تنبيهات، حوادث، استبدال | محفظة/مالية |
| WALLET_OPERATOR | شحن/عكس محفظة سائق | موافقة مستحقات Finance |
| FINANCE | مستحقات سائق، تخصيص تعويض | شحن محفظة إن لم يُسمح |
| ADMIN / SUPER_ADMIN | إعدادات المنصة، فئات، تسعير، جواز، خصومات | — |

هواتف العملاء/السائقين: **فقط** عبر \`GET /erp/rides/:rideId/contact-info\` (مُدقَّق). لا هاتف خام على لوحة الرحلات الحية.

مستبعد V1: Sham Cash، SFU WebRTC حقيقي، واجهة نقاط سائق، متصفح audit عام إن لم يُعرَّض API.

انظر أيضاً [\`BACKEND-GAPS.md\`](./BACKEND-GAPS.md).

## 3. الـ Stack

| الحزمة | الإصدار | السبب |
|---|---|---|
| next | 15.x App Router | middleware للحماية حسب الدور |
| react | 19.x | متوافق Next 15 |
| typescript | 5.x strict | صرامة العقود |
| @tanstack/react-query | 5.x | كاش السيرفر؛ الـ socket يبطله |
| zustand | 5.x | جلسة/UI فقط |
| tailwindcss | 4.x | RTL عبر \`dir="rtl"\` |
| shadcn/ui + radix | مستقر | جداول ونماذج |
| react-hook-form + zod | أحدث | نماذج كبيرة |
| socket.io-client | 4.8.x | \`/go/staff\` |
| maplibre-gl أو Google Maps | — | تتبع حي |
| next-intl | 4.x | ar / en + RTL |

لا Redux. لا polling لموقع السائق إن وُجدت أحداث socket كافية — حدّث من \`ride.driver_location\` بعد أول تحميل للوحة.

## 4. بنية مقترحة

\`\`\`
apps/web/
  app/
    (auth)/login/page.tsx
    (erp)/layout.tsx
    (erp)/rides/live/page.tsx
    (erp)/alerts/...
    (erp)/complaints/...
    (erp)/emergencies/...
    (erp)/cases/...
    (erp)/wallets/...
    (admin)/layout.tsx
    (admin)/branches|pricing|passport|discounts/...
    middleware.ts
  src/
    api/client.ts       # Bearer + refresh queue + error.code
    api/query-keys.ts
    realtime/socket.ts  # /go/staff
    realtime/invalidate.ts
    components/data-table.tsx
    features/...
\`\`\`

\`middleware.ts\`: موظفو ERP فقط لـ \`(erp)\`؛ Admin/SuperAdmin لـ \`(admin)\`؛ غير ذلك → \`/login\`.

## 5. الشاشات (حالات: تحميل / فارغ / خطأ code / 403)

- تسجيل دخول الموظفين: \`POST /auth/staff/login\` ثم \`GET /auth/me\`
- رحلات حية: \`GET /erp/rides/live\` + sockets
- تفاصيل رحلة + contact-info المدقّق
- تنبيهات / شكاوى / طوارئ / حوادث / استبدال
- محفظة / مستحقات / تعويضات
- Admin: فروع، فئات، تسعير، سائقون، مركبات، عملاء، جواز، خصومات، إعدادات ديسباتش

التفاصيل الكاملة للشاشات والتدفقات في قسم \`HAND_SECTIONS\` أدناه (قبل مرجع API).

## 6. الأخطاء

شكل الباك:

\`\`\`json
{ "statusCode": 403, "code": "ROLE_NOT_ALLOWED", "message": "...", "path": "...", "timestamp": "...", "request_id": "..." }
\`\`\`

الفرع دائماً على \`code\`.

${errorTableMd()}

## 7. Realtime (\`/go/staff\`)

اتصال: \`socket.io-client\` مع JWT في \`auth.token\`.

أحداث مهمة: \`alert.created\` / \`alert.resolved\`، \`long_stop.created\`، \`location_stale.created\`، \`route_deviation.created\`، \`complaint.*\`، \`emergency.*\`، \`case.created\` + \`accident_case.created\` / \`breakdown_case.created\`، \`replacement_ride.created\`، \`scheduled_driver.offline|delay\`، \`ride.created\`.

جدول إبطال queryKey: كل حدث يبطل مفاتيح القائمة/التفاصيل المرتبطة (alerts، rides/live، incidents، emergencies).

## 8. الاختبار والنشر

- Playwright: فرع A لا يرى بيانات فرع B (branch scope).
- مصفوفة أدوار: Wallet Op لا يدخل شاشات Admin التسعير.
- أي تغيير عقد API يحدّث **هذا الملف** + يعيد تشغيل \`npm run docs:gen-go-plans\` في نفس الـ PR.
- DoD: \`npm run docs:validate-plans\` يفشل إن نقص مسار من Swagger في الملفَّين.

## 9. مرجع API الكامل (صيغة 15.2)

كل مسار ERP/Admin/Auth للموظفين أدناه كامل الحقول. لا تعتمد على Swagger وحدها أثناء البناء.

`;

const MOBILE_PREAMBLE = `# MOBILE_PLAN — تطبيقات Beroya Go (عميل + سائق)

عقد واحد لفريق Flutter لـ **Beroya Go**. أي تغيير على API الباك يُحدَّث هنا في نفس الـ PR.

**Base path:** \`/api/v1/go\` · **OpenAPI:** [\`swagger.json\`](./swagger.json)

> عقد واحد في هذا الملف. قسم API يُحدَّث عبر \`npm run docs:gen-go-plans\` (يحافظ على أقسام الشاشات/التدفقات بين العلامات).

## 1. فكرة المنتج

تطبيقان منطقيان على كود مشترك:

| تطبيق | الدور | تدفقات أساسية |
|---|---|---|
| Passenger | \`CUSTOMER\` | OTP → تقدير → اختيار مسار → طلب → تتبع → إلغاء/شكوى/طوارئ → تقييم → جواز/خصم |
| Driver | \`DRIVER\` | OTP → أهلية → أونلاين → عروض → رحلة → محفظة |

الدفع V1: **CASH أو WALLET**. \`SHAM_CASH\` مرفوض من السيرفر. جواز العميل: عرض المستوى + السلسلة فقط — **ممنوع عرض النقاط**. جواز السائق: \`framework_only\`.

## 2. الـ Stack

| الحزمة | الاستخدام |
|---|---|
| Flutter 3.x | UI |
| Riverpod | حالة |
| go_router | تنقل |
| dio (+ interceptors) | شبكة + refresh |
| freezed + json_serializable | موديلات |
| flutter_secure_storage | توكنات |
| socket_io_client | \`/go/customer\` · \`/go/driver\` · \`/go/emergency-audio\` |
| google_maps_flutter / mapbox | خرائط |
| geolocator + خلفية موقع | تطبيق السائق |
| Isar/Hive | طابور مواقع أوفلاين |

Monorepo مقترح: \`packages/core\` + \`apps/customer\` + \`apps/driver\`.

## 3. أصعب نقاط يجب توثيقها في التنفيذ

1. **موقع السائق في الخلفية:** Foreground Service + إشعار دائم (Android)؛ \`UIBackgroundModes: location\` (iOS)؛ إرسال دوري لـ \`POST /driver/location\`؛ batch عند الأوفلاين عبر \`location/batch\`.
2. **طابور الأوفلاين:** حفظ النقاط محلياً عند انقطاع الشبكة ورفعها عند العودة.
3. **Sockets أولاً:** حالة الرحلة والعروض من \`/go/customer\` و \`/go/driver\` — REST fallback فقط عند الحاجة.
4. **مسارات بديلة قبل الطلب فقط:** \`POST /customer/rides/estimate\` يرجع \`routes[]\` (Google Routes API مع بدائل؛ وإلا OSRM أو خط تقريبي). العميل يختار مساراً واحداً ويرسله في \`selected_route\` عند الإنشاء. بعد بدء الرحلة لا قائمة بدائل — تغيير الوجهة/المحطات يعيد حساب مسار واحد عبر السوكيت. ارسم \`encoded_polyline\` (ترميز Google) على الخريطة. السعر معادلة SYP على السيرفر؛ Google لا يسعّر. عند الإكمال الأجرة من مسار GPS الفعلي لا من التقدير.

قيود سلبية V1 — لا تبنِها: لا Sham Cash، لا SFU WebRTC حقيقي، لا نقاط سائق، لا إيصال PDF للعميل، لا QR، لا حجز مقعد مسبق كمنتج منفصل عن \`SCHEDULED\`.

التفاصيل الكاملة للشاشات والتدفقات في قسم \`HAND_SECTIONS\` أدناه (قبل مرجع API).

## 4. المصادقة

\`POST /auth/otp/request\` ثم \`verify\` مع \`app: CUSTOMER|DRIVER\`. في التطوير الرمز \`123456\`. خزّن access+refresh. عند \`401\` نهائي / \`SESSION_REVOKED\` امسح التخزين الآمن والكاش (مهم بعد تغيير رقم الهاتف من الـ ERP).

## 5. الأخطاء

نفس مغلف \`ErrorResponseDto\` والجدول أدناه. الفرع على \`code\`.

${errorTableMd()}

## 6. Realtime

| Namespace | أحداث أساسية |
|---|---|
| \`/go/customer\` | \`ride.*\` (يشمل \`ride.message\` / \`ride.messages_read\`)، \`passport.updated\`، \`discount_code.available\`، \`complaint.updated\`، \`emergency.*\`، \`notification.created\` |
| \`/go/driver\` | \`ride_offer.created\` (+legacy \`ride.offer\`)، \`expired\`، \`taken\`، \`wallet.*\`، \`driver.forced_offline\`، \`scheduled_ride.*\`، \`ride.message\` |
| \`/go/emergency-audio\` | إشارة صوت طوارئ قصيرة العمر |

## 7. مرجع API الكامل (صيغة 15.2)

مسارات العميل والسائق والمصادقة المشتركة:

`;

const HAND_BEGIN = '<!-- BEGIN HAND_SECTIONS -->';
const HAND_END = '<!-- END HAND_SECTIONS -->';

function extractHandSections(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const text = fs.readFileSync(filePath, 'utf8');
  const start = text.indexOf(HAND_BEGIN);
  const end = text.indexOf(HAND_END);
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + HAND_END.length);
}

function writePlans() {
  const mobileOps = collectOps(
    (p) =>
      p.includes('/customer/') ||
      p.includes('/driver/') ||
      p.includes('/auth/otp') ||
      p.includes('/app/') ||
      p.includes('/public/track') ||
      p.includes('/media/chat') ||
      p.startsWith('/t/') ||
      p === '/api/v1/go/auth/refresh' ||
      p === '/api/v1/go/auth/logout' ||
      p === '/api/v1/go/auth/logout-all' ||
      p === '/api/v1/go/auth/me',
  ).filter((o) => !o.p.includes('/auth/staff'));

  const frontendOps = collectOps(
    (p) =>
      p.includes('/erp/') ||
      p.includes('/admin/') ||
      p.includes('/auth/staff') ||
      p === '/api/v1/go/auth/refresh' ||
      p === '/api/v1/go/auth/logout' ||
      p === '/api/v1/go/auth/logout-all' ||
      p === '/api/v1/go/auth/me' ||
      p === '/api/v1/go/health' ||
      p.startsWith('/api/v1/go/meta/') ||
      p.includes('/pos') ||
      p.includes('/operations/'),
  );

  const frontendPath = path.join(ROOT, 'docs', 'FRONTEND-PLAN.md');
  const mobilePath = path.join(ROOT, 'docs', 'MOBILE-PLAN.md');

  const feHand = extractHandSections(frontendPath);
  const moHand = extractHandSections(mobilePath);

  const feBody =
    FRONTEND_PREAMBLE.replace(
      '## 9. مرجع API الكامل (صيغة 15.2)',
      `${feHand ? feHand + '\n\n' : ''}## 9. مرجع API الكامل (صيغة 15.2)`,
    ) + renderApiSection(frontendOps);

  const moBody =
    MOBILE_PREAMBLE.replace(
      '## 7. مرجع API الكامل (صيغة 15.2)',
      `${moHand ? moHand + '\n\n' : ''}## 7. مرجع API الكامل (صيغة 15.2)`,
    ) + renderApiSection(mobileOps);

  fs.writeFileSync(frontendPath, feBody, 'utf8');
  fs.writeFileSync(mobilePath, moBody, 'utf8');

  console.log('Wrote', frontendPath, 'ops', frontendOps.length, feHand ? '(kept HAND_SECTIONS)' : '(no HAND_SECTIONS)');
  console.log('Wrote', mobilePath, 'ops', mobileOps.length, moHand ? '(kept HAND_SECTIONS)' : '(no HAND_SECTIONS)');

  const lists = {
    frontend: frontendOps.map((o) => `${o.method.toUpperCase()} ${o.p}`),
    mobile: mobileOps.map((o) => `${o.method.toUpperCase()} ${o.p}`),
  };
  fs.writeFileSync(path.join(ROOT, 'docs', 'generated-plan-ops.json'), JSON.stringify(lists, null, 2));
}

writePlans();
