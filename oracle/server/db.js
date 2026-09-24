import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;
export const db = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});

await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz`);
await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version text`);

export async function query(text, params = []) {
  return db.query(text, params);
}

export async function transaction(fn) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertUser(tgUser, startParam) {
  return transaction(async client => {
    const existing = await client.query("SELECT * FROM users WHERE telegram_id=$1", [String(tgUser.id)]);
    if (existing.rowCount) {
      const user = (await client.query(`UPDATE users SET first_name=$2, username=$3, language_code=$4,
        last_seen_at=now(), streak=CASE WHEN last_seen_at::date = current_date - 1 THEN streak + 1
          WHEN last_seen_at::date < current_date - 1 THEN 1 ELSE streak END
        WHERE telegram_id=$1 RETURNING *`, [String(tgUser.id), tgUser.first_name || "Путник", tgUser.username || null, tgUser.language_code || "ru"])).rows[0];
      return user;
    }

    const referralCode = startParam?.startsWith("ref_") ? startParam.slice(4) : null;
    const acquisitionSource = startParam && !referralCode ? startParam.slice(0,80) : null;
    let referrerId = null;
    if (referralCode) {
      const referrer = await client.query("SELECT id FROM users WHERE referral_code=$1", [referralCode]);
      referrerId = referrer.rows[0]?.id || null;
    }
    const generated = `a${Number(tgUser.id).toString(36)}${Math.random().toString(36).slice(2,6)}`;
    const user = (await client.query(`INSERT INTO users
      (telegram_id, first_name, username, language_code, referral_code, referred_by, acquisition_source)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [String(tgUser.id), tgUser.first_name || "Путник", tgUser.username || null, tgUser.language_code || "ru", generated, referrerId, acquisitionSource])).rows[0];
    if (referrerId) {
      await client.query("INSERT INTO referrals(referrer_id,referred_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [referrerId,user.id]);
      await client.query("UPDATE users SET bonus_requests=bonus_requests+3 WHERE id=$1", [referrerId]);
    }
    return user;
  });
}

export async function publicUser(userId) {
  const { rows } = await query(`SELECT u.*,
    (SELECT count(*)::int FROM readings WHERE user_id=u.id) total_readings,
    (SELECT count(*)::int FROM referrals WHERE referrer_id=u.id) referrals,
    (SELECT count(*)::int FROM usage_daily WHERE user_id=u.id AND used_on=current_date) used_today
    FROM users u WHERE u.id=$1`, [userId]);
  const u = rows[0];
  if (!u) return null;
  const premium = u.premium_until && new Date(u.premium_until) > new Date();
  const left = premium ? 999 : Math.max(0, config.freeDailyRequests + u.bonus_requests - (u.used_today || 0));
  return {
    id:u.id, firstName:u.first_name, username:u.username, streak:u.streak,
    referralCode:u.referral_code, referrals:u.referrals, totalReadings:u.total_readings,
    premiumUntil:u.premium_until, requestsLeft:left, isAdmin:config.adminIds.has(u.telegram_id),
    reminderEnabled:u.reminder_enabled,
    termsAccepted:Boolean(u.terms_accepted_at), termsVersion:u.terms_version,
  };
}

export async function acceptTerms(userId, version = "1") {
  await query(`UPDATE users SET terms_accepted_at=now(), terms_version=$2 WHERE id=$1`,[userId,version]);
  return publicUser(userId);
}

export async function consumeRequest(userId) {
  return transaction(async client => {
    const user = (await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE",[userId])).rows[0];
    if (!user) throw Object.assign(new Error("user_not_found"),{status:404});
    const premium = user.premium_until && new Date(user.premium_until)>new Date();
    const usage = (await client.query(`INSERT INTO usage_daily(user_id,used_on,count) VALUES($1,current_date,1)
      ON CONFLICT(user_id,used_on) DO UPDATE SET count=usage_daily.count+1 RETURNING count`,[userId])).rows[0];
    if (!premium && usage.count > config.freeDailyRequests + user.bonus_requests) {
      throw Object.assign(new Error("daily_limit"),{status:402});
    }
    if (!premium && usage.count > config.freeDailyRequests && user.bonus_requests > 0) {
      await client.query("UPDATE users SET bonus_requests=bonus_requests-1 WHERE id=$1",[userId]);
    }
  });
}

export async function saveReading(userId, kind, title, input, result) {
  const { rows } = await query(`INSERT INTO readings(user_id,kind,title,input,result)
    VALUES($1,$2,$3,$4,$5) RETURNING id,created_at`,[userId,kind,title,input,result]);
  return rows[0];
}
