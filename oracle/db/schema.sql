CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id text UNIQUE NOT NULL,
  first_name text NOT NULL,
  username text,
  language_code text DEFAULT 'ru',
  referral_code text UNIQUE NOT NULL,
  referred_by uuid REFERENCES users(id),
  acquisition_source text,
  bonus_requests integer NOT NULL DEFAULT 0 CHECK (bonus_requests >= 0),
  premium_until timestamptz,
  reminder_enabled boolean NOT NULL DEFAULT false,
  reminder_hour_utc smallint NOT NULL DEFAULT 8 CHECK(reminder_hour_utc BETWEEN 0 AND 23),
  last_reminder_on date,
  streak integer NOT NULL DEFAULT 1,
  terms_accepted_at timestamptz,
  terms_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('daily','oracle','tarot','compatibility','dream')),
  title text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}',
  result jsonb NOT NULL,
  favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS readings_user_created_idx ON readings(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS reading_messages (
  id bigserial PRIMARY KEY,
  reading_id uuid NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reading_messages_reading_idx ON reading_messages(reading_id,id);

CREATE TABLE IF NOT EXISTS usage_daily (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_on date NOT NULL DEFAULT current_date,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,used_on)
);

CREATE TABLE IF NOT EXISTS daily_cards (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_date date NOT NULL DEFAULT current_date,
  reading_id uuid NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id,card_date)
);

CREATE TABLE IF NOT EXISTS referrals (
  referrer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activated_at timestamptz,
  reward_granted_at timestamptz,
  premium_reward_granted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(referrer_id,referred_id)
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id bigserial PRIMARY KEY,
  code text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  premium_days integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code,user_id)
);
CREATE INDEX IF NOT EXISTS promo_redemptions_code_idx ON promo_redemptions(code);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_charge_id text UNIQUE NOT NULL,
  product text NOT NULL,
  stars integer NOT NULL,
  payload text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_name_created_idx ON events(name,created_at DESC);
