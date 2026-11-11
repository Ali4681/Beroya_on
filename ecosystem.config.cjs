/**
 * PM2 — both apps (from repo root)
 *
 *   pm2 start ecosystem.config.cjs
 *
 * Or start each folder’s own file:
 *   pm2 start Beroya-On-Backend/ecosystem.config.cjs
 *   pm2 start frontend/ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'beroya-backend',
      cwd: './Beroya-On-Backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 10_000,
      env: {
        NODE_ENV: 'production',
        PORT: 3160,
      },
      error_file: 'logs/backend-error.log',
      out_file: 'logs/backend-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'beroya-frontend',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 127.0.0.1 -p 3150',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 10_000,
      env: {
        NODE_ENV: 'production',
        PORT: 3150,
        API_URL: 'https://apiberoyaon.beroyaon.com',
        NEXT_PUBLIC_GO_API_URL: 'https://apiberoyaon.beroyaon.com/api/v1/go',
        NEXT_PUBLIC_SITE_URL: 'https://beroyaon.com',
        NEXT_PUBLIC_SOCKET_URL: 'https://apiberoyaon.beroyaon.com',
      },
      error_file: 'logs/frontend-error.log',
      out_file: 'logs/frontend-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
