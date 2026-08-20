import { supabase } from "./supabaseClient";

/* ------------------------------- AUTH ------------------------------- */

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/* ------------------------------ TRAINERS ------------------------------ */

export async function fetchTrainers() {
  const { data, error } = await supabase.from("trainers").select("*").order("id");
  if (error) throw error;
  return data;
}

export async function fetchTrainerByAuthId(authUserId) {
  const { data, error } = await supabase.from("trainers").select("*").eq("auth_user_id", authUserId).maybeSingle();
  if (error) throw error;
  return data;
}

// All clients assigned to a trainer, via the client_trainers join table.
export async function fetchClientsForTrainer(trainerId) {
  const { data, error } = await supabase
    .from("client_trainers")
    .select("clients(*)")
    .eq("trainer_id", trainerId);
  if (error) throw error;
  return (data || []).map((row) => row.clients).filter(Boolean);
}

/* ------------------------------- CLIENTS ------------------------------- */

export async function fetchClientByAuthId(authUserId) {
  const { data, error } = await supabase.from("clients").select("*").eq("auth_user_id", authUserId).maybeSingle();
  if (error) throw error;
  return data;
}

// Creates the client's row after signup, and links them to the right trainer(s)
// for their chosen plan (basic = none, plan/vip = both trainers).
export async function createClientProfile({ authUserId, name, plan, billing, price, trainerIds }) {
  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      auth_user_id: authUserId,
      name,
      plan,
      billing,
      price,
      goals: { kcal: 2000, protein: 120, carbs: 220, fat: 60 },
    })
    .select()
    .single();
  if (error) throw error;

  if (trainerIds.length > 0) {
    const rows = trainerIds.map((trainerId) => ({ client_id: client.id, trainer_id: trainerId }));
    const { error: linkError } = await supabase.from("client_trainers").insert(rows);
    if (linkError) throw linkError;
  }

  return client;
}

export async function activateSubscription(clientId) {
  const { data, error } = await supabase
    .from("clients")
    .update({ subscription_active: true, last_active_at: new Date().toISOString() })
    .eq("id", clientId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function completeOnboarding(clientId, onboarding) {
  const { data, error } = await supabase
    .from("clients")
    .update({ onboarding, onboarding_complete: true, last_active_at: new Date().toISOString() })
    .eq("id", clientId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function touchClient(clientId) {
  await supabase.from("clients").update({ last_active_at: new Date().toISOString() }).eq("id", clientId);
}

export async function updateClientProfile(clientId, fields) {
  const { data, error } = await supabase.from("clients").update(fields).eq("id", clientId).select().single();
  if (error) throw error;
  return data;
}

export async function setClientGoals(clientId, goals) {
  const { data, error } = await supabase.from("clients").update({ goals }).eq("id", clientId).select().single();
  if (error) throw error;
  return data;
}

// Average completed workout sessions per week over the last N weeks —
// used to compare against the trainer's planned frequency.
export async function fetchWeeklySessionRate(clientId, weeks = 3) {
  const since = new Date();
  since.setDate(since.getDate() - weeks * 7);
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("finished_at")
    .eq("client_id", clientId)
    .gte("finished_at", since.toISOString());
  if (error) throw error;
  return (data || []).length / weeks;
}

/* ------------------------------- MEAL PLAN ------------------------------- */
// Trainer-prescribed diet — the client sees this in their nutrition diary and
// can either check items off (auto-logs them) or log something else manually.

export async function fetchMealPlan(clientId) {
  const { data, error } = await supabase
    .from("meal_plan_items")
    .select("*")
    .eq("client_id", clientId)
    .order("meal")
    .order("position");
  if (error) throw error;
  return data || [];
}

export async function addMealPlanItem(clientId, item) {
  const { error } = await supabase.from("meal_plan_items").insert({
    client_id: clientId,
    meal: item.meal,
    name: item.name,
    serving_label: item.servingLabel,
    qty: item.qty,
    kcal: item.kcal,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    position: item.position || 0,
  });
  if (error) throw error;
}

export async function removeMealPlanItem(itemId) {
  const { error } = await supabase.from("meal_plan_items").delete().eq("id", itemId);
  if (error) throw error;
}

/* ------------------------------- WORKOUTS ------------------------------- */

export async function fetchWorkoutsForClient(clientId) {
  const { data, error } = await supabase
    .from("workouts")
    .select("*, workout_exercises(*)")
    .eq("client_id", clientId)
    .order("assigned_date", { ascending: false });
  if (error) throw error;
  return (data || []).map((w) => ({
    ...w,
    workout_exercises: [...(w.workout_exercises || [])].sort((a, b) => a.position - b.position),
  }));
}

export async function createWorkout(clientId, title, items, periodizationWeek, createdBy = "trainer") {
  const { data: workout, error } = await supabase
    .from("workouts")
    .insert({ client_id: clientId, title, periodization_week: periodizationWeek || null, created_by: createdBy })
    .select()
    .single();
  if (error) throw error;

  const rows = items.map((it, i) => ({
    workout_id: workout.id,
    name: it.name,
    sets: it.sets,
    position: i,
    is_assisted: !!it.isAssisted,
    periodization_enabled: it.periodizationEnabled !== false,
    base_name: it.baseName || null,
    equipment: it.equipment || null,
    side: it.side || null,
  }));
  const { error: exError } = await supabase.from("workout_exercises").insert(rows);
  if (exError) throw exError;

  await touchClient(clientId);
  return workout;
}

export async function deleteWorkout(workoutId) {
  const { error } = await supabase.from("workouts").delete().eq("id", workoutId);
  if (error) throw error;
}

export async function toggleExerciseDone(exerciseId, done) {
  const { error } = await supabase.from("workout_exercises").update({ done }).eq("id", exerciseId);
  if (error) throw error;
}

export async function saveWorkoutSession(clientId, payload) {
  const { error } = await supabase.from("workout_sessions").insert({
    client_id: clientId,
    workout_id: payload.workoutId,
    title: payload.title,
    started_at: new Date(payload.startedAt).toISOString(),
    finished_at: new Date(payload.finishedAt).toISOString(),
    duration_sec: payload.durationSec,
    exercises: payload.exercises,
    note: payload.note || null,
    rating: payload.rating || null,
  });
  if (error) throw error;

  await Promise.all(
    payload.exercises.map((ex) => supabase.from("workout_exercises").update({ done: ex.done }).eq("id", ex.id))
  );
  await touchClient(clientId);
}

export async function fetchSessionsForClient(clientId) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("client_id", clientId)
    .order("finished_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/* ------------------------------- NUTRITION ------------------------------- */

export async function fetchNutritionForDate(clientId, date) {
  const { data, error } = await supabase
    .from("nutrition_entries")
    .select("*")
    .eq("client_id", clientId)
    .eq("entry_date", date)
    .order("created_at");
  if (error) throw error;
  return data || [];
}

export async function addNutritionEntry(clientId, date, entry) {
  const { error } = await supabase.from("nutrition_entries").insert({
    client_id: clientId,
    entry_date: date,
    meal: entry.meal,
    food_id: entry.foodId,
    name: entry.name,
    serving_label: entry.servingLabel,
    qty: entry.qty,
    kcal: entry.kcal,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
  });
  if (error) throw error;
  await touchClient(clientId);
}

export async function removeNutritionEntry(entryId) {
  const { error } = await supabase.from("nutrition_entries").delete().eq("id", entryId);
  if (error) throw error;
}

/* -------------------------------- PRODUCTS -------------------------------- */
// Searchable food database table (imported from Open Food Facts, ~1,846 items,
// see supabase_products_table.sql). This is now the primary search source.

export async function searchProductsDb(query) {
  const { data, error } = await supabase
    .from("products")
    .select("id,name")
    .ilike("name", `%${query}%`)
    .limit(8);
  if (error) throw error;
  return (data || []).map((p) => ({ id: `db_${p.id}`, name: p.name }));
}

export async function getProductDetailsDb(id) {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/* --------------------------------- CHAT --------------------------------- */

export async function fetchChatMessages(clientId) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at");
  if (error) throw error;
  return data || [];
}

export async function sendChatMessage(clientId, fromName, senderRole, text, attachment) {
  const { error } = await supabase.from("chat_messages").insert({
    client_id: clientId, from_name: fromName, sender_role: senderRole, text,
    attachment_url: attachment?.path || null, attachment_type: attachment?.type || null,
  });
  if (error) throw error;
  await touchClient(clientId);
}

export async function uploadChatAttachment(clientId, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${clientId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(path, file);
  if (error) throw error;
  return { path, type: file.type.startsWith("video") ? "video" : "image" };
}

// Приватные бакеты — прямой URL не отдаёт файл никому постороннему. Подписанная
// ссылка выдаётся только тем, кому разрешает RLS (клиент-владелец или его тренер),
// действует ограниченное время.
export async function getSignedFileUrl(bucket, path, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

// Живая подписка на новые сообщения в чате конкретного клиента.
// Возвращает функцию отписки — вызвать при размонтировании компонента.
export function subscribeToChatMessages(clientId, onInsert) {
  const channel = supabase
    .channel(`chat:${clientId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages", filter: `client_id=eq.${clientId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Живая подписка на реакции по всем сообщениям чата (проще подписаться на
// таблицу целиком и фильтровать на клиенте, чем городить join-фильтр).
export function subscribeToChatReactions(onChange) {
  const channel = supabase
    .channel(`chat-reactions-${Math.random()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export async function fetchReactionsForMessages(messageIds) {
  if (messageIds.length === 0) return [];
  const { data, error } = await supabase.from("chat_reactions").select("*").in("message_id", messageIds);
  if (error) throw error;
  return data || [];
}

// Один пользователь — одна реакция на сообщение. Повторный тап той же
// реакцией снимает её, другой — заменяет.
export async function toggleChatReaction(messageId, authUserId, emoji) {
  const { data: existing } = await supabase
    .from("chat_reactions").select("*")
    .eq("message_id", messageId).eq("auth_user_id", authUserId).maybeSingle();
  if (existing && existing.emoji === emoji) {
    await supabase.from("chat_reactions").delete().eq("id", existing.id);
  } else if (existing) {
    await supabase.from("chat_reactions").update({ emoji }).eq("id", existing.id);
  } else {
    await supabase.from("chat_reactions").insert({ message_id: messageId, auth_user_id: authUserId, emoji });
  }
}

export async function markChatRead(authUserId, clientId) {
  await supabase.from("chat_reads").upsert(
    { auth_user_id: authUserId, client_id: clientId, last_read_at: new Date().toISOString() },
    { onConflict: "auth_user_id,client_id" }
  );
}

// Единый инбокс тренера: по каждому VIP-клиенту — последнее сообщение и
// количество непрочитанных (сообщений от клиента после last_read_at тренера).
export async function fetchTrainerInbox(trainerAuthId, clients) {
  const results = await Promise.all(
    clients.map(async (c) => {
      const [{ data: lastMsgs }, { data: readRow }] = await Promise.all([
        supabase.from("chat_messages").select("*").eq("client_id", c.id).order("created_at", { ascending: false }).limit(1),
        supabase.from("chat_reads").select("last_read_at").eq("auth_user_id", trainerAuthId).eq("client_id", c.id).maybeSingle(),
      ]);
      const lastMessage = (lastMsgs || [])[0] || null;
      const since = readRow?.last_read_at || "1970-01-01";
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("client_id", c.id)
        .eq("sender_role", "client")
        .gt("created_at", since);
      return { client: c, lastMessage, unreadCount: count || 0 };
    })
  );
  return results.sort((a, b) => {
    const ta = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
    const tb = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
    return tb - ta;
  });
}

/* ------------------------------- CHECK-INS ------------------------------- */

export async function fetchCheckins(clientId) {
  const { data, error } = await supabase
    .from("checkins")
    .select("*")
    .eq("client_id", clientId)
    .order("entry_date", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addCheckin(clientId, checkin) {
  const { error } = await supabase.from("checkins").insert({
    client_id: clientId,
    entry_date: checkin.date,
    weight: checkin.weight,
    waist: checkin.waist, hips: checkin.hips, chest: checkin.chest, arm: checkin.arm,
    energy: checkin.energy, adherence: checkin.adherence, note: checkin.note,
    photo_url: checkin.photoUrl || null,
  });
  if (error) throw error;
  await touchClient(clientId);
}

export async function uploadCheckinPhoto(clientId, file) {
  const path = `${clientId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("checkin-photos").upload(path, file);
  if (error) throw error;
  return path;
}

/* ------------------------------- PROGRESS ------------------------------- */

export async function fetchProgress(clientId) {
  const { data, error } = await supabase
    .from("progress_entries")
    .select("*")
    .eq("client_id", clientId)
    .order("entry_date");
  if (error) throw error;
  return data || [];
}

export async function addProgressEntry(clientId, weight, note) {
  const { error } = await supabase.from("progress_entries").insert({
    client_id: clientId, entry_date: new Date().toISOString().slice(0, 10), weight, note,
  });
  if (error) throw error;
  await touchClient(clientId);
}

/* ---------------------------- PUSH NOTIFICATIONS ---------------------------- */

export async function savePushSubscription(authUserId, subscription) {
  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      auth_user_id: authUserId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;
}

export async function deletePushSubscription(endpoint) {
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
}

export async function fetchNutritionLoggingDays(clientId, sinceDate) {
  const { data, error } = await supabase
    .from("nutrition_entries")
    .select("entry_date")
    .eq("client_id", clientId)
    .gte("entry_date", sinceDate);
  if (error) throw error;
  return new Set((data || []).map((d) => d.entry_date)).size;
}

/* ------------------------------ ШАБЛОНЫ ТРЕНИРОВОК ------------------------------ */

export async function fetchTemplates(trainerId) {
  const { data, error } = await supabase
    .from("workout_templates")
    .select("*, workout_template_exercises(*)")
    .eq("trainer_id", trainerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((t) => ({
    ...t,
    exercises: [...(t.workout_template_exercises || [])].sort((a, b) => a.position - b.position),
  }));
}

export async function createTemplate(trainerId, title, items) {
  const { data: template, error } = await supabase
    .from("workout_templates")
    .insert({ trainer_id: trainerId, title })
    .select()
    .single();
  if (error) throw error;
  const rows = items.map((it, i) => ({
    template_id: template.id, name: it.name, sets: it.sets, position: i,
    is_assisted: !!it.isAssisted, periodization_enabled: it.periodizationEnabled !== false,
    base_name: it.baseName || null, equipment: it.equipment || null, side: it.side || null,
  }));
  const { error: exError } = await supabase.from("workout_template_exercises").insert(rows);
  if (exError) throw exError;
  return template;
}

export async function deleteTemplate(templateId) {
  const { error } = await supabase.from("workout_templates").delete().eq("id", templateId);
  if (error) throw error;
}

export async function assignTemplateToClient(clientId, template, titleOverride) {
  return createWorkout(
    clientId,
    titleOverride || template.title,
    template.exercises.map((e) => ({
      name: e.name, sets: e.sets,
      isAssisted: e.is_assisted, periodizationEnabled: e.periodization_enabled,
      baseName: e.base_name, equipment: e.equipment, side: e.side,
    }))
  );
}

/* ------------------------------ ЦЕЛИ ПО УПРАЖНЕНИЯМ ------------------------------ */

export async function fetchExerciseGoals(clientId) {
  const { data, error } = await supabase
    .from("exercise_goals")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addExerciseGoal(clientId, exerciseName, metric, targetValue) {
  const { error } = await supabase.from("exercise_goals").insert({
    client_id: clientId, exercise_name: exerciseName, metric, target_value: targetValue,
  });
  if (error) throw error;
}

export async function deleteExerciseGoal(goalId) {
  const { error } = await supabase.from("exercise_goals").delete().eq("id", goalId);
  if (error) throw error;
}

/* ------------------------------ МИКРОЦИКЛЫ ------------------------------ */

export async function fetchMicrocycles(trainerId) {
  const { data, error } = await supabase
    .from("microcycle_templates")
    .select("*, microcycle_workouts(*, microcycle_workout_exercises(*))")
    .eq("trainer_id", trainerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((m) => ({
    ...m,
    workouts: [...(m.microcycle_workouts || [])]
      .sort((a, b) => a.position - b.position)
      .map((w) => ({
        ...w,
        exercises: [...(w.microcycle_workout_exercises || [])].sort((a, b) => a.position - b.position),
      })),
  }));
}

export async function createMicrocycle(trainerId, title, days) {
  const { data: microcycle, error } = await supabase
    .from("microcycle_templates")
    .insert({ trainer_id: trainerId, title })
    .select()
    .single();
  if (error) throw error;

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const { data: workout, error: wError } = await supabase
      .from("microcycle_workouts")
      .insert({ microcycle_id: microcycle.id, title: day.title, position: i })
      .select()
      .single();
    if (wError) throw wError;

    const rows = day.items.map((it, j) => ({
      microcycle_workout_id: workout.id, name: it.name, sets: it.sets, position: j,
      is_assisted: !!it.isAssisted, periodization_enabled: it.periodizationEnabled !== false,
      base_name: it.baseName || null, equipment: it.equipment || null, side: it.side || null,
    }));
    const { error: exError } = await supabase.from("microcycle_workout_exercises").insert(rows);
    if (exError) throw exError;
  }

  return microcycle;
}

export async function deleteMicrocycle(id) {
  const { error } = await supabase.from("microcycle_templates").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------ ОПИСАНИЯ УПРАЖНЕНИЙ ------------------------------ */

export async function fetchAllExerciseDetails() {
  const { data, error } = await supabase.from("exercise_details").select("*");
  if (error) throw error;
  const map = {};
  (data || []).forEach((d) => { map[d.name] = d; });
  return map;
}

export async function fetchExerciseDetail(name) {
  const { data, error } = await supabase.from("exercise_details").select("*").eq("name", name).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertExerciseDetail(name, description, videoUrl) {
  const { error } = await supabase
    .from("exercise_details")
    .upsert({ name, description, video_url: videoUrl, updated_at: new Date().toISOString() }, { onConflict: "name" });
  if (error) throw error;
}

export async function uploadExerciseVideo(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("exercise-videos").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("exercise-videos").getPublicUrl(path);
  return data.publicUrl;
}

/* ------------------------------ ДОСТИЖЕНИЯ ------------------------------ */

export async function fetchClientAchievements(clientId) {
  const { data, error } = await supabase
    .from("client_achievements")
    .select("*")
    .eq("client_id", clientId);
  if (error) throw error;
  return data || [];
}

export async function addClientAchievement(clientId, achievementKey) {
  const { error } = await supabase
    .from("client_achievements")
    .insert({ client_id: clientId, achievement_key: achievementKey });
  if (error && error.code !== "23505") throw error; // 23505 = уже есть, это нормально
}

/* ------------------------- НАСТРОЙКИ УВЕДОМЛЕНИЙ ------------------------- */

export async function fetchNotificationPreferences(authUserId) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return data || { notify_messages: true, notify_workouts: true };
}

export async function updateNotificationPreferences(authUserId, prefs) {
  const { error } = await supabase.from("notification_preferences").upsert(
    { auth_user_id: authUserId, ...prefs, updated_at: new Date().toISOString() },
    { onConflict: "auth_user_id" }
  );
  if (error) throw error;
}

/* ------------------------------ АККАУНТ ------------------------------ */

export async function changePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function updateTrainerProfile(trainerId, fields) {
  const { data, error } = await supabase.from("trainers").update(fields).eq("id", trainerId).select().single();
  if (error) throw error;
  return data;
}
