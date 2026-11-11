# PgBouncer على سيرفر الإنتاج (تفصيلي)

**المحلي:** يبقى `DATABASE_URL` على Postgres مباشرة (`:5432`) + `pg.Pool` داخل Nest.  
**الإنتاج:** التطبيق → PgBouncer (`:6432`) → PostgreSQL (`:5432`).

افترض: Ubuntu/Debian، Postgres والتطبيق على **نفس السيرفر**، قاعدة الاسم `beroya_go`.

استبدل دائمًا:
- `DB_USER` / `DB_PASS` / `DB_NAME` بقيم السيرفر الحقيقية
- لا تفتح منفذ `6432` على الإنترنت العام

---

## 0) تحقق قبل البدء

```bash
# Postgres يشتغل ويقبل اتصال محلي
sudo systemctl status postgresql
psql "postgresql://DB_USER:DB_PASS@127.0.0.1:5432/DB_NAME" -c 'SELECT version();'

# نوع مصادقة المستخدم (مهم لـ auth_type في PgBouncer)
sudo -u postgres psql -c "SELECT rolname, rolpassword IS NOT NULL AS has_secret FROM pg_authid WHERE rolname = 'DB_USER';"
```

إذا فشل `psql` على `5432`، أصلح Postgres أولًا قبل PgBouncer.

---

## 1) تثبيت PgBouncer

```bash
sudo apt update
sudo apt install -y pgbouncer
pgbouncer -V
```

---

## 2) ملف المستخدمين `userlist.txt`

```bash
sudo nano /etc/pgbouncer/userlist.txt
```

محتوى الملف (علامات اقتباس إلزامية):

```text
"DB_USER" "DB_PASS"
```

صلاحيات:

```bash
sudo chown postgres:postgres /etc/pgbouncer/userlist.txt
sudo chmod 600 /etc/pgbouncer/userlist.txt
```

> بعض التوزيعات تشغّل الخدمة كـ `pgbouncer` user — إن فشل التشغيل بسبب صلاحيات، اضبط المالك حسب وحدة systemd لديك (`ps aux | grep pgbouncer`).

---

## 3) إعداد `pgbouncer.ini`

```bash
sudo cp /etc/pgbouncer/pgbouncer.ini /etc/pgbouncer/pgbouncer.ini.bak
sudo nano /etc/pgbouncer/pgbouncer.ini
```

مثال كامل مناسب لـ Beroya + Prisma:

```ini
[databases]
; الاسم الأيسر = ما يظهر في connection string بعد الـ /
beroya_go = host=127.0.0.1 port=5432 dbname=beroya_go

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
unix_socket_dir = /var/run/postgresql

auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

; مناسب لمعظم طلبات Prisma قصيرة العمر
pool_mode = transaction

max_client_conn = 200
default_pool_size = 20
min_pool_size = 2
reserve_pool_size = 5
reserve_pool_timeout = 3

server_reset_query = DISCARD ALL
ignore_startup_parameters = extra_float_digits

; سجلات
admin_users = DB_USER
stats_users = DB_USER
logfile = /var/log/postgresql/pgbouncer.log
pidfile = /var/run/postgresql/pgbouncer.pid
```

ملاحظات:
- إذا `auth_type = scram-sha-256` رفض كلمة المرور، جرّب `md5`.
- إذا ظهر خطأ Prisma مع transactions طويلة، بدّل مؤقتًا إلى `pool_mode = session`.
- `listen_addr = 127.0.0.1` فقط طالما الـ API على نفس الجهاز.

---

## 4) تشغيل وتفعيل عند الإقلاع

```bash
sudo systemctl enable pgbouncer
sudo systemctl restart pgbouncer
sudo systemctl status pgbouncer --no-pager
```

إذا فشل:

```bash
sudo journalctl -u pgbouncer -e --no-pager
sudo tail -n 100 /var/log/postgresql/pgbouncer.log
```

---

## 5) اختبار الاتصال عبر Bouncer

```bash
# عبر المنفذ 6432
psql "postgresql://DB_USER:DB_PASS@127.0.0.1:6432/beroya_go" -c 'SELECT current_database(), current_user;'
```

يجب أن ينجح مثل الاتصال على `5432`.

اختياري — كونسول إدارة PgBouncer (إن كان `admin_users` مضبوطًا):

```bash
psql "postgresql://DB_USER:DB_PASS@127.0.0.1:6432/pgbouncer" -c 'SHOW POOLS;'
psql "postgresql://DB_USER:DB_PASS@127.0.0.1:6432/pgbouncer" -c 'SHOW CLIENTS;'
```

---

## 6) تعديل `.env` لتطبيق Beroya على السيرفر

في مجلد الـ backend على السيرفر:

```env
# التطبيق (API / workers) يمر على PgBouncer
DATABASE_URL=postgresql://DB_USER:DB_PASS@127.0.0.1:6432/beroya_go?schema=public&pgbouncer=true

# migrations / أدوات إدارية على Postgres مباشرة (مهم)
DIRECT_URL=postgresql://DB_USER:DB_PASS@127.0.0.1:5432/beroya_go?schema=public

# حجم pool داخل كل عملية Node (خلف Bouncer خليه معتدل)
PG_POOL_MAX=10
PG_POOL_IDLE_TIMEOUT_MS=30000
PG_POOL_CONN_TIMEOUT_MS=5000
```

ثم أعد تشغيل خدمة التطبيق (مثال):

```bash
# حسب طريقة تشغيلك:
sudo systemctl restart beroya-backend
# أو pm2 restart ...
# أو docker/k8s rollout — حسب بنيتك
```

---

## 7) الـ migrations دائمًا على الاتصال المباشر

في الكود الحالي، `npm run build` و`npm run prisma:deploy` يستخدمان `scripts/prisma-direct.cjs`:
يقرآن `DIRECT_URL` من `.env` ويشغّلان migrate على **5432** تلقائيًا.

على السيرفر تأكد فقط أن `.env` فيه:

```env
DIRECT_URL=postgresql://DB_USER:DB_PASS@127.0.0.1:5432/beroya_go?schema=public
```

ثم:

```bash
cd /path/to/Beroya-On-Backend
npm run prisma:deploy
# أو ضمن البناء:
npm run build
```

ستظهر رسالة مثل: `[prisma-direct] using DIRECT_URL → postgresql://...@127.0.0.1:5432/...`

لا تشغّل `npx prisma migrate deploy` يدويًا على `:6432`.

---

## 8) Checklist بعد التفعيل

1. `systemctl status pgbouncer` = active  
2. `psql` على `:6432` ينجح  
3. Login للـ desk / ERP ينجح  
4. فتح رحلة + خريطة مركز القيادة  
5. `SHOW POOLS;` يظهر اتصالات للتطبيق  
6. migrate على `:5432` ينجح  

---

## 9) مشاكل شائعة

| العرض | السبب المحتمل | الحل |
| --- | --- | --- |
| `password authentication failed` عبر 6432 | `userlist.txt` أو `auth_type` | طابق كلمة المرور؛ جرّب `md5` / `scram-sha-256` |
| التطبيق يتصل لكن transactions تفشل | `pool_mode=transaction` | جرّب `session` |
| `connection refused` على 6432 | الخدمة واقفة أو listen خاطئ | `systemctl status` + تأكد `listen_addr` |
| كثرة اتصالات على Postgres | `PG_POOL_MAX` كبير × عدد الـ instances | خفّض `PG_POOL_MAX` و/أو `default_pool_size` |
| migrate غريب عبر 6432 | استخدام Bouncer للـ DDL | استخدم `DIRECT_URL` على 5432 فقط |

---

## 10) إذا التطبيق على سيرفر والـ DB على سيرفر آخر

- على سيرفر Postgres: `listen_addr` لـ PgBouncer على IP داخلي خاص (VPN/private)، ليس `0.0.0.0` عامًا بدون جدار ناري.
- `DATABASE_URL` يشير لـ `IP_الـDB_الداخلي:6432`.
- أغلق `6432` من الإنترنت العام (firewall/`ufw`).
