// Vercel serverless function: POST /api/notify/workout-assigned
// Настраивается как цель для Supabase Database Webhook на workouts INSERT.

import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const workout = req.body?.record;
    if (!workout) return res.status(200).json({ skipped: "no record" });

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("auth_user_id")
      .eq("id", workout.client_id)
      .maybeSingle();
    if (!client?.auth_user_id) return res.status(200).json({ skipped: "no client" });

    const { data: pref } = await supabaseAdmin
      .from("notification_preferences")
      .select("notify_workouts")
      .eq("auth_user_id", client.auth_user_id)
      .maybeSingle();
    if (pref?.notify_workouts === false) return res.status(200).json({ skipped: "opted out" });

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .eq("auth_user_id", client.auth_user_id);

    const payloadStr = JSON.stringify({
      title: "Новая тренировка",
      body: `Тренер назначил вам: ${workout.title}`,
      url: "/",
    });

    await Promise.all(
      (subs || []).map((s) =>
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, payloadStr)
          .catch(async (err) => {
            if (err.statusCode === 410 || err.statusCode === 404) {
              await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
            }
          })
      )
    );

    res.status(200).json({ sent: (subs || []).length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "notify_failed" });
  }
}
