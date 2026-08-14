import React, { useState, useEffect } from "react";
import { Trash2, Copy, Layers, TrendingUp, Zap } from "lucide-react";
import { AssignWorkoutForm, formatSets } from "./Workouts";
import {
  fetchTemplates, createTemplate, deleteTemplate, assignTemplateToClient,
  fetchSessionsForClient, fetchWorkoutsForClient, createWorkout,
} from "../lib/api";

/* ------------------------------ ШАБЛОНЫ ------------------------------ */

export function TemplateManager({ trainer }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => { setLoading(true); fetchTemplates(trainer.id).then((t) => { setTemplates(t); setLoading(false); }); };
  useEffect(() => { load(); }, [trainer.id]);

  const handleCreate = async (title, items) => {
    await createTemplate(trainer.id, title, items);
    setShowCreate(false);
    load();
  };

  const handleDelete = async (id) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    await deleteTemplate(id);
  };

  return (
    <div className="px-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Layers size={15} color="var(--accent)" />
        <h2 className="fp-display text-xl font-semibold">Шаблоны тренировок</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
        Соберите тренировку один раз — потом назначайте её любому клиенту в пару кликов, без повторного набора упражнений.
      </p>

      {showCreate ? (
        <AssignWorkoutForm onAssign={handleCreate} onCancel={() => setShowCreate(false)} />
      ) : (
        <button className="fp-btn fp-btn-accent px-4 py-2.5 mb-5" onClick={() => setShowCreate(true)}>
          + Новый шаблон
        </button>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Шаблонов пока нет.</p>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div key={t.id} className="fp-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">{t.title}</div>
                <button onClick={() => handleDelete(t.id)}><Trash2 size={15} color="var(--danger)" /></button>
              </div>
              <ul className="text-sm space-y-1">
                {t.exercises.map((e) => (
                  <li key={e.id} style={{ color: "var(--ink-soft)" }}>{e.name} — {formatSets(e.sets)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssignFromTemplate({ trainer, clientId, onAssigned }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchTemplates(trainer.id).then((t) => { setTemplates(t); setLoading(false); }); }, [trainer.id]);

  const assign = async (template) => {
    await assignTemplateToClient(clientId, template);
    onAssigned?.();
  };

  if (loading) return <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Загрузка шаблонов…</p>;
  if (templates.length === 0) return <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Шаблонов пока нет — создайте их на Обзоре.</p>;

  return (
    <div className="space-y-2 mb-4">
      {templates.map((t) => (
        <button key={t.id} onClick={() => assign(t)} className="fp-card w-full p-3 text-left flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{t.title}</div>
            <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{t.exercises.length} упражнений</div>
          </div>
          <Copy size={15} color="var(--accent)" />
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ ПЕРИОДИЗАЦИЯ ------------------------------ */

export const WEEK_PLAN = [
  { key: "base", label: "Неделя 1 — база", weightMult: 1.0, setsMult: 1, note: "Точка отсчёта — средний рабочий вес за последние тренировки." },
  { key: "build", label: "Неделя 2 — рост объёма", weightMult: 1.05, setsMult: 1, note: "Вес +5%, тот же объём." },
  { key: "peak", label: "Неделя 3 — пик интенсивности", weightMult: 1.1, setsMult: 1, note: "Вес +10% — пиковая нагрузка блока." },
  { key: "deload", label: "Неделя 4 — разгрузка (deload)", weightMult: 0.65, setsMult: 0.75, note: "Вес и объём вниз — даём ЦНС и суставам восстановиться перед новым циклом." },
];

function exerciseBaseline(exerciseName, sessions) {
  const weights = [];
  let reps = "10";
  sessions.forEach((s) => {
    (s.exercises || []).forEach((e) => {
      if (e.name === exerciseName && Array.isArray(e.actualSets)) {
        e.actualSets.forEach((set) => {
          const w = parseFloat(set.weight);
          if (!isNaN(w) && w > 0) weights.push(w);
          if (set.reps) reps = set.reps;
        });
      }
    });
  });
  if (weights.length === 0) return null;
  return { avgWeight: weights.reduce((a, b) => a + b, 0) / weights.length, reps, samples: weights.length };
}

export function effectiveWeightMult(ex, week) {
  // Ассистируемые (гравитрон/резина): больше вес/сопротивление = легче.
  // Значит "прогресс" — это СНИЖЕНИЕ веса на неделях роста и ПОВЫШЕНИЕ на разгрузке.
  return ex.is_assisted ? 1 / week.weightMult : week.weightMult;
}

function buildWeekExercises(baseWorkout, baselines, week) {
  return baseWorkout.workout_exercises.map((ex) => {
    const baseline = baselines[ex.name];
    const passthrough = { name: ex.name, isAssisted: ex.is_assisted, periodizationEnabled: ex.periodization_enabled };
    if (!baseline || ex.periodization_enabled === false) return { ...passthrough, sets: ex.sets };
    const targetCount = Math.max(1, Math.round(ex.sets.length * week.setsMult));
    const weight = Math.max(0, Math.round(baseline.avgWeight * effectiveWeightMult(ex, week)));
    const sets = Array.from({ length: targetCount }, () => ({ reps: baseline.reps, weight: String(weight) }));
    return { ...passthrough, sets };
  });
}

export function PeriodizationPanel({ client }) {
  const [sessions, setSessions] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  const [created, setCreated] = useState({});

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSessionsForClient(client.id), fetchWorkoutsForClient(client.id)]).then(([s, w]) => {
      setSessions(s);
      setWorkouts(w);
      if (w.length > 0) setSelectedWorkoutId(w[0].id);
      setLoading(false);
    });
  }, [client.id]);

  if (loading) return <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>;
  if (workouts.length === 0) return <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Сначала назначьте клиенту тренировку — периодизация строится на основе выполненных сессий по ней.</p>;

  const baseWorkout = workouts.find((w) => w.id === selectedWorkoutId) || workouts[0];
  const relevantSessions = sessions.filter((s) => s.workout_id === baseWorkout.id).slice(0, 4);

  const baselines = {};
  baseWorkout.workout_exercises.forEach((ex) => { baselines[ex.name] = exerciseBaseline(ex.name, relevantSessions); });
  const hasEnoughData = baseWorkout.workout_exercises.some(
    (ex) => ex.periodization_enabled !== false && baselines[ex.name] && baselines[ex.name].samples >= 2
  );

  const handleCreateWeek = async (week) => {
    setCreating(week.key);
    const exercises = buildWeekExercises(baseWorkout, baselines, week);
    await createWorkout(client.id, baseWorkout.title, exercises);
    setCreated((prev) => ({ ...prev, [week.key]: true }));
    setCreating(null);
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <TrendingUp size={15} color="var(--accent)" />
        <h3 className="fp-display font-semibold">Периодизация нагрузки</h3>
      </div>

      {workouts.length > 1 && (
        <div className="mb-4">
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>На основе тренировки</label>
          <select className="fp-input" value={selectedWorkoutId} onChange={(e) => setSelectedWorkoutId(e.target.value)}>
            {workouts.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
          </select>
        </div>
      )}

      {relevantSessions.length < 1 ? (
        <div className="fp-card p-4 mb-4" style={{ background: "var(--bg)" }}>
          <div className="flex items-start gap-2">
            <Zap size={15} color="var(--accent)" style={{ marginTop: 2, flexShrink: 0 }} />
            <p className="text-sm">
              Клиент ещё не завершил ни одной тренировки по «{baseWorkout.title}». Как только пройдёт первая — здесь появится
              расчёт весов на следующий 4-недельный блок на основе того, что он реально поднимал.
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            Расчёт на основе {relevantSessions.length} последних тренировок по «{baseWorkout.title}» — реальные веса, которые поднимал клиент.
            Классическая волна: рост объёма → пик → разгрузка, чтобы прогресс продолжался без перегрузки ЦНС.
          </p>
          <div className="space-y-3">
            {WEEK_PLAN.map((week) => (
              <div key={week.key} className="fp-card p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-semibold text-sm">{week.label}</div>
                  {created[week.key] ? (
                    <span className="fp-chip" style={{ background: "var(--accent-2)", color: "#fff" }}>Создано ✓</span>
                  ) : (
                    <button
                      className="fp-btn fp-btn-outline px-3 py-1.5 text-xs disabled:opacity-40"
                      disabled={creating === week.key || !hasEnoughData}
                      onClick={() => handleCreateWeek(week)}
                    >
                      {creating === week.key ? "Создаём…" : "Создать эту неделю"}
                    </button>
                  )}
                </div>
                <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>{week.note}</p>
                <ul className="text-xs space-y-1">
                  {baseWorkout.workout_exercises.map((ex) => {
                    if (ex.periodization_enabled === false) {
                      return <li key={ex.id} style={{ color: "var(--ink-soft)" }}>{ex.name} — не участвует в периодизации (вес не меняется)</li>;
                    }
                    const b = baselines[ex.name];
                    if (!b) return <li key={ex.id} style={{ color: "var(--ink-soft)" }}>{ex.name} — недостаточно данных</li>;
                    const weight = Math.max(0, Math.round(b.avgWeight * effectiveWeightMult(ex, week)));
                    const count = Math.max(1, Math.round(ex.sets.length * week.setsMult));
                    return (
                      <li key={ex.id}>
                        {ex.name}{ex.is_assisted ? " (ассист.)" : ""} — {count} × {b.reps} × {weight} кг
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
