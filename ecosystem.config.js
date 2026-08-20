const path = require("path");

module.exports = {
  apps: [
    {
      name: "ccash-backend",
      script: path.join(__dirname, "start-backend.sh"),
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      env_file: path.join(__dirname, "backend/.env"),
      env: {
        PYTHONUNBUFFERED: "1",
      },
      error_file: path.join(__dirname, "logs/backend-error.log"),
      out_file: path.join(__dirname, "logs/backend-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      // Consumes the email/OTP queue and runs the daily-limit reset on beat.
      // Nothing consumed this queue before, so OTP emails never left RabbitMQ.
      name: "ccash-celery",
      script: path.join(__dirname, "start-celery.sh"),
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env_file: path.join(__dirname, "backend/.env"),
      env: {
        PYTHONUNBUFFERED: "1",
      },
      error_file: path.join(__dirname, "logs/celery-error.log"),
      out_file: path.join(__dirname, "logs/celery-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      name: "ccash-frontend",
      cwd: path.join(__dirname, "frontend"),
      script: "npx",
      args: "vite preview --host 0.0.0.0 --port 8830",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      error_file: path.join(__dirname, "logs/frontend-error.log"),
      out_file: path.join(__dirname, "logs/frontend-out.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
