/**
 * PM2 — Beroya On Frontend (Next.js)
 *
 * Nginx: proxy_pass http://127.0.0.1:3150
 *
 * On the server (from this folder):
 *   npm ci
 *   # set API_URL in .env to the public API origin (or http://127.0.0.1:3160)
 *   npm run build
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'beroya-frontend',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 127.0.0.1 -p 3150',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 10_000,
      listen_timeout: 15_000,
      env: {
        NODE_ENV: 'production',
        PORT: 3150,
        // Upstream API (nginx → this host). Override in .env if needed.
        API_URL: 'https://apiberoyaon.beroyaon.com',
        NEXT_PUBLIC_GO_API_URL: 'https://apiberoyaon.beroyaon.com/api/v1/go',
        NEXT_PUBLIC_SITE_URL: 'https://beroyaon.com',
        NEXT_PUBLIC_SOCKET_URL: 'https://apiberoyaon.beroyaon.com',
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
