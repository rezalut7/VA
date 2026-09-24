import "dotenv/config";

function int(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

export const config = {
  port: int("PORT", 3010),
  publicUrl: (process.env.PUBLIC_URL || "http://localhost:5174").replace(/\/$/, ""),
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/oracle",
  databaseSsl: process.env.DATABASE_SSL === "true",
  sessionSecret: process.env.SESSION_SECRET || "dev-only-change-before-production",
  botToken: process.env.TELEGRAM_BOT_TOKEN || "",
  botUsername: process.env.TELEGRAM_BOT_USERNAME || "madam_agrippina_bot",
  telegramRelayUrl: (process.env.TELEGRAM_RELAY_URL || "").replace(/\/$/, ""),
  telegramRelaySecret: process.env.TELEGRAM_RELAY_SECRET || "",
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
  cronSecret: process.env.CRON_SECRET || "",
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5-mini",
  adminIds: new Set((process.env.ADMIN_TELEGRAM_IDS || "").split(",").map(x=>x.trim()).filter(Boolean)),
  allowDevAuth: process.env.ALLOW_DEV_AUTH === "true",
  freeDailyRequests: int("FREE_DAILY_REQUESTS", 3),
  premiumWeekStars: int("PREMIUM_WEEK_STARS", 149),
  extraRequestsStars: int("EXTRA_REQUESTS_STARS", 49),
  promoWeekCode: (process.env.PROMO_WEEK_CODE || "AGRIPPINA7").trim().toUpperCase(),
  promoWeekLimit: int("PROMO_WEEK_LIMIT", 100),
};

if (process.env.NODE_ENV === "production" && config.sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters in production");
}
