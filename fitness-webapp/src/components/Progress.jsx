import React, { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Camera, ClipboardCheck, Sparkles, Lightbulb, TrendingUp, TrendingDown, Minus, ImageOff } from "lucide-react";
import {
  fetchCheckins, addCheckin, uploadCheckinPhoto,
  fetchProgress, fetchWorkoutsForClient, fetchNutritionLoggingDays,
} from "../lib/api";
import { ExerciseProgressSection } from "./ExerciseProgress";

function todayStr() { return new Date().toISOString().slice(0, 10); }
function humanDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}
function daysBetween(a, b) { return Math.floor((a.getTime() - b.getTime()) / 86400000); }

/* ------------------------------ ЧЕК-ИНЫ ------------------------------ */

function RatingPicker({ value, onChange, labelLow, labelHigh }) {
  return (
    <div>
      <div className="flex gap-1.5 mb-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n} onClick={() => onChange(n)}
            style={{
              width: 26, height: 26, borderRadius: 8, border: "2px solid",
              borderColor: n <= value ? "var(--accent-2)" : "var(--line)",
              background: n <= value ? "var(--accent-2)" : "#fff",
              color: n <= value ? "#fff" : "var(--ink-soft)",
              fontSize: 11, fontWeight: 700,
            }}
          >{n}</button>
        ))}
      </div>
      <div className="flex justify-between text-[10px]" style={{ color: "var(--ink-soft)" }}>
        <span>{labelLow}</span><span>{labelHigh}</span>
      </div>
    </div>
  );
}

function CheckinForm({ clientId, onAdded }) {
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState(""); const [hips, setHips] = useState("");
  const [chest, setChest] = useState(""); const [arm, setArm] = useState("");
  const [energy, setEnergy] = useState(3); const [adherence, setAdherence] = useState(3);
  const [note, setNote] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    if (!weight) return;
    setBusy(true);
    let photoUrl = null;
    if (photoFile) {
      try { photoUrl = await uploadCheckinPhoto(clientId, photoFile); } catch (e) { photoUrl = null; }
    }
    await addCheckin(clientId, {
      date: todayStr(), weight: Number(weight),
      waist: waist ? Number(waist) : null, hips: hips ? Number(hips) : null,
      chest: chest ? Number(chest) : null, arm: arm ? Number(arm) : null,
      energy, adherence, note: note.trim(), photoUrl,
    });
    setWeight(""); setWaist(""); setHips(""); setChest(""); setArm("");
    setEnergy(3); setAdherence(3); setNote(""); setPhotoFile(null); setPhotoPreview(null);
    setBusy(false);
    onAdded?.();
  };

  return (
    <div className="fp-card p-4 mb-5">
      <div className="flex items-center gap-1.5 mb-3">
        <ClipboardCheck size={15} color="var(--accent)" />
        <h3 className="fp-display font-semibold">Еженедельный чек-ин</h3>
      </div>

      <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Вес, кг *</label>
      <input className="fp-input mb-3" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />

      <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Замеры, см (необязательно)</label>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[["Талия", waist, setWaist], ["Бёдра", hips, setHips], ["Грудь", chest, setChest], ["Рука", arm, setArm]].map(([label, val, setter]) => (
          <div key={label}>
            <input className="fp-input" type="number" value={val} onChange={(e) => setter(e.target.value)} placeholder={label} />
            <div className="text-[10px] text-center mt-1" style={{ color: "var(--ink-soft)" }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <RatingPicker value={energy} onChange={setEnergy} labelLow="Энергия: низкая" labelHigh="высокая" />
        <RatingPicker value={adherence} onChange={setAdherence} labelLow="План: не следовал" labelHigh="следовал" />
      </div>

      <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Заметка (необязательно)</label>
      <input className="fp-input mb-3" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Как прошла неделя?" />

      <label className="text-xs mb-1.5 flex items-center gap-1.5" style={{ color: "var(--ink-soft)" }}>
        <Camera size={12} /> Фото прогресса (необязательно)
      </label>
      <div className="flex items-center gap-3 mb-4">
        <label className="fp-btn fp-btn-outline px-3 py-2 text-xs cursor-pointer">
          Выбрать фото
          <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
        </label>
        {photoPreview && <img src={photoPreview} alt="превью" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }} />}
      </div>

      <button className="fp-btn fp-btn-accent w-full py-2.5 disabled:opacity-40" disabled={!weight || busy} onClick={submit}>
        {busy ? "Сохраняем…" : "Отправить чек-ин"}
      </button>
    </div>
  );
}

function CheckinHistory({ checkins }) {
  if (checkins.length === 0) return <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Чек-инов пока нет.</p>;
  return (
    <div className="space-y-3">
      {checkins.map((c, idx) => {
        const prev = checkins[idx + 1];
        const diff = prev ? +(c.weight - prev.weight).toFixed(1) : null;
        return (
          <div key={c.id} className="fp-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{humanDate(c.entry_date)}</span>
              <span className="text-sm font-semibold">
                {c.weight} кг {diff !== null && (
                  <span style={{ color: diff <= 0 ? "var(--accent-2)" : "var(--accent)", fontWeight: 500 }}>({diff > 0 ? "+" : ""}{diff})</span>
                )}
              </span>
            </div>
            <div className="flex gap-3">
              {c.photo_url ? (
                <img src={c.photo_url} alt="фото прогресса" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, flexShrink: 0 }} />
              ) : (
                <div className="flex items-center justify-center" style={{ width: 64, height: 64, borderRadius: 10, background: "var(--bg)", flexShrink: 0 }}>
                  <ImageOff size={16} color="var(--ink-soft)" />
                </div>
              )}
              <div className="text-xs flex-1" style={{ color: "var(--ink-soft)" }}>
                {(c.waist || c.hips || c.chest || c.arm) && (
                  <div className="mb-1">
                    {[["Талия", c.waist], ["Бёдра", c.hips], ["Грудь", c.chest], ["Рука", c.arm]].filter(([, v]) => v).map(([l, v]) => `${l} ${v}`).join(" · ")}
                  </div>
                )}
                <div>Энергия {c.energy}/5 · План {c.adherence}/5</div>
                {c.note && <div style={{ color: "var(--ink)" }} className="mt-1">{c.note}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeightChart({ points }) {
  if (points.length === 0) return null;
  return (
    <div style={{ width: "100%", height: 200 }}>
      <ResponsiveContainer>
        <LineChart data={points}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="label" fontSize={11} stroke="var(--ink-soft)" />
          <YAxis fontSize={11} stroke="var(--ink-soft)" domain={["dataMin - 2", "dataMax + 2"]} />
          <Tooltip />
          <Line type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------ ДИАГНОСТИКА ------------------------------ */

const GOAL_DIRECTION = { "Похудение": "down", "Набор массы": "up", "Поддержание формы": "stable", "Восстановление после травмы": "stable" };

function computeTrend(points) {
  if (points.length < 2) return { direction: "not-enough-data", perWeek: 0 };
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const n = sorted.length;
  const head = sorted.slice(0, Math.min(2, n));
  const tail = sorted.slice(-Math.min(2, n));
  const startValue = head.reduce((s, p) => s + p.value, 0) / head.length;
  const endValue = tail.reduce((s, p) => s + p.value, 0) / tail.length;
  const days = Math.max(daysBetween(new Date(sorted[n - 1].date), new Date(sorted[0].date)), 1);
  const perWeek = (endValue - startValue) / Math.max(days / 7, 0.5);
  let direction = "stable";
  if (perWeek <= -0.15) direction = "down"; else if (perWeek >= 0.15) direction = "up";
  return { direction, perWeek };
}

const QUADRANT_META = {
  "on-track": { label: "На курсе", color: "var(--accent-2)", trainerNote: "Дисциплина высокая, результат соответствует цели — план работает, держите курс.", clientNote: "Ты на верном пути — так держать!" },
  "at-risk": { label: "Риск отката", color: "#D9A441", trainerNote: "Результат есть, но дисциплина низкая — риск отката. Стоит закрепить привычки и почаще выходить на связь.", clientNote: "Результат уже есть — осталось закрепить привычки, чтобы его не растерять." },
  "adjust-plan": { label: "Скорректировать план", color: "var(--accent)", trainerNote: "Дисциплина высокая, а результата по цели нет — вероятно, дело в плане. Пересмотрите калораж или программу.", clientNote: "Ты классно держишь дисциплину — тренер скоро скорректирует план." },
  "needs-engagement": { label: "Нужна вовлечённость", color: "var(--danger)", trainerNote: "Ни дисциплины, ни результата — вероятно, дело не в плане, а в вовлечённости. Стоит созвониться.", clientNote: "В последнее время сложнее придерживаться плана — напиши тренеру, если нужна поддержка." },
  "unclear": { label: "Недостаточно данных", color: "var(--ink-soft)", trainerNote: "Пока мало данных для выводов — ориентируйтесь на дисциплину и самочувствие клиента.", clientNote: "Продолжай отмечать тренировки и питание — так тренеру проще подстроить план." },
};

async function computeInsight(client) {
  const [checkins, progress, workouts, nutritionDays] = await Promise.all([
    fetchCheckins(client.id),
    fetchProgress(client.id),
    fetchWorkoutsForClient(client.id),
    fetchNutritionLoggingDays(client.id, new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
  ]);

  const weightPoints = [
    ...progress.map((p) => ({ date: p.entry_date, value: p.weight })),
    ...checkins.map((c) => ({ date: c.entry_date, value: c.weight })),
  ];
  const weightTrend = computeTrend(weightPoints);

  const now = new Date();
  const last30 = new Date(now); last30.setDate(now.getDate() - 30);
  const checkinsLast30 = checkins.filter((c) => new Date(c.entry_date) >= last30).length;
  const checkinConsistency = Math.min(100, Math.round((checkinsLast30 / 4) * 100));

  const recentWorkouts = workouts.filter((w) => new Date(w.assigned_date) >= last30);
  const pool = recentWorkouts.length > 0 ? recentWorkouts : workouts;
  const workoutCompletion = pool.length > 0
    ? Math.round((pool.filter((w) => w.workout_exercises.length > 0 && w.workout_exercises.every((e) => e.done)).length / pool.length) * 100)
    : null;

  const nutritionLogging = Math.min(100, Math.round((nutritionDays / 7) * 100));

  const parts = [checkinConsistency, workoutCompletion, nutritionLogging].filter((v) => v !== null);
  const overall = parts.length > 0 ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
  const level = overall === null ? "unknown" : overall >= 65 ? "high" : overall >= 35 ? "medium" : "low";

  const goalDirection = GOAL_DIRECTION[client.onboarding?.goal] ?? null;
  let resultStatus = "unclear";
  if (goalDirection && weightTrend.direction !== "not-enough-data") {
    resultStatus = weightTrend.direction === goalDirection ? "good" : "none";
  }
  let quadrant = "unclear";
  if (resultStatus === "good") quadrant = level === "low" ? "at-risk" : "on-track";
  else if (resultStatus === "none") quadrant = level === "high" ? "adjust-plan" : "needs-engagement";

  return {
    weightTrend,
    weightPoints: weightPoints.map((p) => ({ ...p, label: humanDate(p.date) })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    checkins, adherence: { checkinConsistency, workoutCompletion, nutritionLogging, overall, level },
    quadrant, goal: client.onboarding?.goal,
  };
}

function trendIcon(direction) {
  if (direction === "down") return TrendingDown;
  if (direction === "up") return TrendingUp;
  return Minus;
}
function trendLabel(t) {
  if (t.direction === "not-enough-data") return "Пока недостаточно замеров";
  if (t.direction === "stable") return "Вес стабилен";
  const v = Math.abs(t.perWeek).toFixed(1);
  return t.direction === "down" ? `Снижается на ${v} кг/нед` : `Растёт на ${v} кг/нед`;
}
function levelLabel(l) { return { high: "высокая", medium: "средняя", low: "низкая", unknown: "нет данных" }[l] || "нет данных"; }

function AdherenceRow({ label, value }) {
  const known = value !== null && value !== undefined;
  const pct = known ? value : 0;
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-1 text-xs">
        <span style={{ color: "var(--ink-soft)" }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{known ? `${value}%` : "нет данных"}</span>
      </div>
      <div className="fp-bar-track"><div className="fp-bar-fill" style={{ width: `${pct}%`, background: known && value >= 65 ? "var(--accent-2)" : known && value >= 35 ? "#D9A441" : "var(--danger)" }} /></div>
    </div>
  );
}

/* ------------------------------ ЭКРАНЫ ------------------------------ */

export function ProgressTab({ client }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => { setLoading(true); computeInsight(client).then((i) => { setInsight(i); setLoading(false); }); };
  useEffect(() => { load(); }, [client.id]);

  if (loading || !insight) return <p className="text-sm px-4" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>;

  const meta = QUADRANT_META[insight.quadrant];
  const TrendIcon = trendIcon(insight.weightTrend.direction);

  return (
    <div className="px-4">
      <div className="fp-card p-5 mb-5" style={{ borderColor: meta.color, borderWidth: 1.5 }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} color={meta.color} />
          <span className="fp-display font-semibold">{insight.goal ? `Цель: ${insight.goal}` : "Твой прогресс"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm mb-3" style={{ color: "var(--ink-soft)" }}>
          <TrendIcon size={14} /> {trendLabel(insight.weightTrend)}
        </div>
        <p className="text-sm mb-4">{meta.clientNote}</p>
        <AdherenceRow label="Логирование питания" value={insight.adherence.nutritionLogging} />
        <AdherenceRow label="Тренировки выполнены" value={insight.adherence.workoutCompletion} />
        <AdherenceRow label="Регулярность чек-инов" value={insight.adherence.checkinConsistency} />
      </div>

      {insight.weightPoints.length > 0 && (
        <div className="fp-card p-4 mb-5">
          <div className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>ВЕС СО ВРЕМЕНЕМ</div>
          <WeightChart points={insight.weightPoints} />
        </div>
      )}

      <div className="mb-5">
        <ExerciseProgressSection client={client} />
      </div>

      <CheckinForm clientId={client.id} onAdded={load} />
      <CheckinHistory checkins={insight.checkins} />
    </div>
  );
}

export function TrainerProgressPanel({ client }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setLoading(true); computeInsight(client).then((i) => { setInsight(i); setLoading(false); }); }, [client.id]);

  if (loading || !insight) return <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>;

  const meta = QUADRANT_META[insight.quadrant];
  const TrendIcon = trendIcon(insight.weightTrend.direction);

  return (
    <div>
      <div className="fp-card p-4 mb-5" style={{ borderColor: meta.color, borderWidth: 1.5 }}>
        <div className="flex items-center justify-between mb-3">
          <span className="fp-chip" style={{ background: meta.color, color: "#fff" }}>{meta.label}</span>
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Цель: {insight.goal || "не указана"}</span>
        </div>
        <p className="text-sm mb-3 flex items-start gap-1.5">
          <Lightbulb size={14} color={meta.color} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{meta.trainerNote}</span>
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mb-3 text-xs">
          <div className="fp-card p-2.5" style={{ background: "var(--bg)" }}>
            <div style={{ color: "var(--ink-soft)" }} className="mb-1 flex items-center gap-1"><TrendIcon size={12} /> Тренд веса</div>
            <div style={{ fontWeight: 600 }}>{trendLabel(insight.weightTrend)}</div>
          </div>
          <div className="fp-card p-2.5" style={{ background: "var(--bg)" }}>
            <div style={{ color: "var(--ink-soft)" }} className="mb-1">Общая дисциплина</div>
            <div style={{ fontWeight: 600 }}>{insight.adherence.overall !== null ? `${insight.adherence.overall}%` : "нет данных"} · {levelLabel(insight.adherence.level)}</div>
          </div>
        </div>
        <AdherenceRow label="Логирование питания" value={insight.adherence.nutritionLogging} />
        <AdherenceRow label="Выполнение тренировок" value={insight.adherence.workoutCompletion} />
        <AdherenceRow label="Регулярность чек-инов" value={insight.adherence.checkinConsistency} />
      </div>

      {insight.weightPoints.length > 0 && (
        <div className="fp-card p-4 mb-5">
          <div className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>ВЕС СО ВРЕМЕНЕМ</div>
          <WeightChart points={insight.weightPoints} />
        </div>
      )}

      <CheckinHistory checkins={insight.checkins} />
    </div>
  );
}
