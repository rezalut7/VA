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
