/**
 * PM2 — Beroya On Backend (NestJS)
 *
 * Nginx: proxy_pass http://127.0.0.1:3160
 *
 * On the server (from this folder):
 *   npm ci
 *   npm run build   # includes prisma migrate deploy
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'beroya-backend',
      cwd: __dirname,
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 10_000,
      listen_timeout: 15_000,
      env: {
        NODE_ENV: 'production',
        PORT: 3160,
      },
      // Keep secrets in .env next to this file (loaded by Nest ConfigModule).
      // Do not put DATABASE_URL / JWT / R2 keys here.
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
