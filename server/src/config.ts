// server/src/config.ts
// All settings come from environment variables (see .env.example).
// Defaults match the GitHub Codespaces dev container.
import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  db: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "irrigation",
    password: process.env.DB_PASSWORD ?? "irrigation_pass",
    database: process.env.DB_NAME ?? "irrigation_monitor",
  },
  // Secret used to sign dashboard login tokens. CHANGE IT before deployment.
  sessionSecret: process.env.SESSION_SECRET ?? "change-this-secret-before-deployment",
  sessionHours: Number(process.env.SESSION_HOURS ?? 8),
  // Key the robot sends in the X-Device-Key header (hashed in the database).
  defaultDeviceKey: process.env.DEVICE_KEY ?? "robot-01-demo-key",
  // Starter accounts created by `npm run db:init` (change after first login).
  defaultAdminPassword: process.env.ADMIN_PASSWORD ?? "Admin@123",
  defaultFarmerPassword: process.env.FARMER_PASSWORD ?? "Farmer@123",
};
