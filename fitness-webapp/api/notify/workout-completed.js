// Vercel serverless function: POST /api/notify/workout-completed
// Настраивается как цель для Supabase Database Webhook на workout_sessions INSERT.

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
    const session = req.body?.record;
    if (!session) return res.status(200).json({ skipped: "no record" });

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("name")
      .eq("id", session.client_id)
      .maybeSingle();

    const { data: links } = await supabaseAdmin
      .from("client_trainers")
      .select("trainer_id")
      .eq("client_id", session.client_id);
    const trainerIds = (links || []).map((l) => l.trainer_id);
    if (trainerIds.length === 0) return res.status(200).json({ skipped: "no trainers" });

    const { data: trainers } = await supabaseAdmin
      .from("trainers")
      .select("auth_user_id")
      .in("id", trainerIds);
    const recipientAuthIds = (trainers || []).map((t) => t.auth_user_id).filter(Boolean);
    if (recipientAuthIds.length === 0) return res.status(200).json({ skipped: "no recipients" });

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .in("auth_user_id", recipientAuthIds);

    const payloadStr = JSON.stringify({
      title: "Тренировка завершена",
      body: `${client?.name || "Клиент"} прошёл(а): ${session.title}`,
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
