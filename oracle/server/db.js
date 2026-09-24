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
await db.query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS activated_at timestamptz`);
await db.query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS reward_granted_at timestamptz`);
await db.query(`ALTER TABLE referrals ADD COLUMN IF NOT EXISTS premium_reward_granted_at timestamptz`);
await db.query(`CREATE TABLE IF NOT EXISTS promo_redemptions (
  id bigserial PRIMARY KEY,
  code text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  premium_days integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code,user_id)
)`);
await db.query(`CREATE INDEX IF NOT EXISTS promo_redemptions_code_idx ON promo_redemptions(code)`);

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
      const current=existing.rows[0];
      let referredBy=current.referred_by;
      const referralCode=startParam?.startsWith("ref_")?startParam.slice(4):null;
      if(referralCode&&!current.terms_accepted_at&&!referredBy) {
        const referrer=await client.query("SELECT id FROM users WHERE referral_code=$1 AND id<>$2",[referralCode,current.id]);
        referredBy=referrer.rows[0]?.id||null;
      }
      const user = (await client.query(`UPDATE users SET first_name=$2, username=$3, language_code=$4,
        referred_by=coalesce(referred_by,$5),
        last_seen_at=now(), streak=CASE WHEN last_seen_at::date = current_date - 1 THEN streak + 1
          WHEN last_seen_at::date < current_date - 1 THEN 1 ELSE streak END
        WHERE telegram_id=$1 RETURNING *`, [String(tgUser.id), tgUser.first_name || "Путник", tgUser.username || null, tgUser.language_code || "ru",referredBy])).rows[0];
      if(referredBy) await client.query("INSERT INTO referrals(referrer_id,referred_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[referredBy,user.id]);
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
    }
    return user;
  });
}

export async function publicUser(userId) {
  const { rows } = await query(`SELECT u.*,
    (SELECT count(*)::int FROM readings WHERE user_id=u.id) total_readings,
    (SELECT count(*)::int FROM referrals WHERE referrer_id=u.id) referrals,
    (SELECT count(*)::int FROM referrals WHERE referrer_id=u.id AND activated_at IS NOT NULL) active_referrals,
    (SELECT count(*)::int FROM usage_daily WHERE user_id=u.id AND used_on=current_date) used_today
    FROM users u WHERE u.id=$1`, [userId]);
  const u = rows[0];
  if (!u) return null;
  const premium = u.premium_until && new Date(u.premium_until) > new Date();
  const left = premium ? 999 : Math.max(0, Math.max(0,config.freeDailyRequests-(u.used_today||0))+u.bonus_requests);
  return {
    id:u.id, firstName:u.first_name, username:u.username, streak:u.streak,
    referralCode:u.referral_code, referrals:u.referrals, activeReferrals:u.active_referrals, totalReadings:u.total_readings,
    premiumUntil:u.premium_until, requestsLeft:left, isAdmin:config.adminIds.has(u.telegram_id),
    reminderEnabled:u.reminder_enabled,
    termsAccepted:Boolean(u.terms_accepted_at), termsVersion:u.terms_version,
  };
}

export async function acceptTerms(userId, version = "1") {
  await transaction(async client=>{
    const user=(await client.query("SELECT terms_accepted_at,referred_by FROM users WHERE id=$1 FOR UPDATE",[userId])).rows[0];
    if(!user) throw Object.assign(new Error("user_not_found"),{status:404});
    if(!user.terms_accepted_at) {
      await client.query(`UPDATE users SET terms_accepted_at=now(),terms_version=$2,
        bonus_requests=bonus_requests+CASE WHEN referred_by IS NOT NULL THEN 2 ELSE 0 END WHERE id=$1`,[userId,version]);
    }
  });
  return publicUser(userId);
}

const referralMilestones=new Map([[3,1],[5,3],[10,7]]);

export async function activateReferral(userId) {
  return transaction(async client=>{
    const referral=(await client.query(`SELECT r.referrer_id,r.referred_id,u.first_name referred_name
      FROM referrals r JOIN users u ON u.id=r.referred_id
      WHERE r.referred_id=$1 FOR UPDATE OF r`,[userId])).rows[0];
    if(!referral) return null;
    const changed=await client.query(`UPDATE referrals SET activated_at=now(),reward_granted_at=now()
      WHERE referred_id=$1 AND activated_at IS NULL RETURNING referrer_id`,[userId]);
    if(!changed.rowCount) return null;
    await client.query("UPDATE users SET bonus_requests=bonus_requests+3 WHERE id=$1",[referral.referrer_id]);
    const active=Number((await client.query("SELECT count(*) FROM referrals WHERE referrer_id=$1 AND activated_at IS NOT NULL",[referral.referrer_id])).rows[0].count);
    const premiumDays=referralMilestones.get(active)||0;
    if(premiumDays) await client.query(`UPDATE users SET premium_until=GREATEST(coalesce(premium_until,now()),now())+$2*interval '1 day' WHERE id=$1`,[referral.referrer_id,premiumDays]);
    const referrer=(await client.query("SELECT telegram_id,first_name FROM users WHERE id=$1",[referral.referrer_id])).rows[0];
    return {...referrer,referredName:referral.referred_name,active,premiumDays,bonusRequests:3};
  });
}

export async function rewardReferralPurchase(userId) {
  return transaction(async client=>{
    const referral=(await client.query(`UPDATE referrals SET premium_reward_granted_at=now()
      WHERE referred_id=$1 AND activated_at IS NOT NULL AND premium_reward_granted_at IS NULL
      RETURNING referrer_id`,[userId])).rows[0];
    if(!referral) return null;
    await client.query(`UPDATE users SET premium_until=GREATEST(coalesce(premium_until,now()),now())+interval '1 day' WHERE id=$1`,[referral.referrer_id]);
    return (await client.query("SELECT telegram_id,first_name FROM users WHERE id=$1",[referral.referrer_id])).rows[0];
  });
}

export async function redeemPromo(userId, rawCode) {
  const code=String(rawCode||"").trim().toUpperCase();
  if(code!==config.promoWeekCode) throw Object.assign(new Error("Промокод не найден"),{status:404});
  return transaction(async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[code]);
    const used=Number((await client.query("SELECT count(*) FROM promo_redemptions WHERE code=$1",[code])).rows[0].count);
    if(used>=config.promoWeekLimit) throw Object.assign(new Error("Лимит активаций этого промокода исчерпан"),{status:409});
    const inserted=await client.query(`INSERT INTO promo_redemptions(code,user_id,premium_days) VALUES($1,$2,7)
      ON CONFLICT(code,user_id) DO NOTHING RETURNING id`,[code,userId]);
    if(!inserted.rowCount) throw Object.assign(new Error("Вы уже активировали этот промокод"),{status:409});
    await client.query(`UPDATE users SET premium_until=GREATEST(coalesce(premium_until,now()),now())+interval '7 days' WHERE id=$1`,[userId]);
  });
  return publicUser(userId);
}

export async function consumeRequest(userId) {
  return transaction(async client => {
    const user = (await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE",[userId])).rows[0];
    if (!user) throw Object.assign(new Error("user_not_found"),{status:404});
    const premium = user.premium_until && new Date(user.premium_until)>new Date();
    const used=Number((await client.query("SELECT count FROM usage_daily WHERE user_id=$1 AND used_on=current_date",[userId])).rows[0]?.count||0);
    if (!premium && used >= config.freeDailyRequests && user.bonus_requests <= 0) {
      throw Object.assign(new Error("daily_limit"),{status:402});
    }
    await client.query(`INSERT INTO usage_daily(user_id,used_on,count) VALUES($1,current_date,1)
      ON CONFLICT(user_id,used_on) DO UPDATE SET count=usage_daily.count+1`,[userId]);
    if (!premium && used >= config.freeDailyRequests) {
      await client.query("UPDATE users SET bonus_requests=bonus_requests-1 WHERE id=$1",[userId]);
    }
  });
}

export async function saveReading(userId, kind, title, input, result) {
  const { rows } = await query(`INSERT INTO readings(user_id,kind,title,input,result)
    VALUES($1,$2,$3,$4,$5) RETURNING id,created_at`,[userId,kind,title,input,result]);
  return rows[0];
}
