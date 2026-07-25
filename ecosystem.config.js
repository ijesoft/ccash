module.exports = {
  apps: [
    {
      name: "ccash-backend",
      script: "/home/ubuntu/Github/ccash/start-backend.sh",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      env_file: "/home/ubuntu/Github/ccash/backend/.env",
      env: {
        PYTHONUNBUFFERED: "1",
      },
      error_file: "/home/ubuntu/Github/ccash/logs/backend-error.log",
      out_file: "/home/ubuntu/Github/ccash/logs/backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      name: "ccash-frontend",
      cwd: "/home/ubuntu/Github/ccash/frontend",
      script: "npx",
      args: "vite preview --host 0.0.0.0 --port 8830",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "/home/ubuntu/Github/ccash/logs/frontend-error.log",
      out_file: "/home/ubuntu/Github/ccash/logs/frontend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
