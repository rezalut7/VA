import React, { useState, useEffect } from "react";
import { Trash2, Copy, Layers, TrendingUp, Zap, Plus, X } from "lucide-react";
import { AssignWorkoutForm, formatSets } from "./Workouts";
import {
  fetchTemplates, createTemplate, deleteTemplate, assignTemplateToClient,
  fetchSessionsForClient, fetchWorkoutsForClient, createWorkout, fetchCheckins,
} from "../lib/api";
import { resolveExerciseType } from "../data/exerciseTypes";
import { GOAL_OPTIONS, GOAL_CORRIDORS, WEEK_TYPE_META, calcWeekTarget } from "../lib/periodizationEngine";

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

function anchorFor(exerciseName, sessions) {
  // Якорный подход — реально выполненный сет с максимальным весом за
  // последние тренировки (а не среднее по всем сетам).
  let best = null;
  sessions.forEach((s) => {
    (s.exercises || []).forEach((e) => {
      if (e.name !== exerciseName || !Array.isArray(e.actualSets)) return;
      e.actualSets.forEach((set) => {
        const w = parseFloat(set.weight);
        const r = parseFloat(set.reps);
        if (isNaN(w) || isNaN(r) || w <= 0) return;
        if (!best || w > best.weight) best = { weight: w, reps: r };
      });
    });
  });
  return best;
}

function extractExerciseMeta(fullName) {
  const parts = (fullName || "").split(" - ");
  const base = parts.length >= 2 ? parts[1] : fullName;
  const equipment = parts[2] || null;
  return { base, equipment };
}

const WEEK_TYPE_OPTIONS = ["light", "medium", "heavy", "deload"];

export function PeriodizationPanel({ client }) {
  const [sessions, setSessions] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState("");
  const [goal, setGoal] = useState("Гипертрофия");
  const [weeks, setWeeks] = useState([{ id: 1, type: "light" }, { id: 2, type: "medium" }, { id: 3, type: "heavy" }, { id: 4, type: "deload" }]);
  const [bodyWeight, setBodyWeight] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  const [created, setCreated] = useState({});

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchSessionsForClient(client.id),
      fetchWorkoutsForClient(client.id),
      fetchCheckins(client.id),
    ]).then(([s, w, checkins]) => {
      setSessions(s);
      setWorkouts(w);
      if (w.length > 0) setSelectedWorkoutId(w[0].id);
      if (checkins.length > 0) setBodyWeight(String(checkins[0].weight));
      else if (client.onboarding?.startWeight) setBodyWeight(String(client.onboarding.startWeight));
      setLoading(false);
    });
  }, [client.id]);

  if (loading) return <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>;
  if (workouts.length === 0) return <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Сначала назначьте клиенту тренировку — периодизация строится на основе выполненных сессий по ней.</p>;

  const baseWorkout = workouts.find((w) => w.id === selectedWorkoutId) || workouts[0];
  const relevantSessions = sessions.filter((s) => s.workout_id === baseWorkout.id).slice(0, 4);

  const exerciseInfo = {}; // name -> { type, anchor }
  baseWorkout.workout_exercises.forEach((ex) => {
    const { base, equipment } = extractExerciseMeta(ex.name);
    const type = ex.periodization_enabled === false ? null : resolveExerciseType(base, equipment);
    const anchor = type ? anchorFor(ex.name, relevantSessions) : null;
    exerciseInfo[ex.name] = { type, anchor };
  });
  const hasEnoughData = Object.values(exerciseInfo).some((i) => i.type && i.anchor);

  const addWeek = () => setWeeks((prev) => [...prev, { id: Date.now(), type: "medium" }]);
  const removeWeek = (id) => setWeeks((prev) => prev.filter((w) => w.id !== id));
  const changeWeekType = (id, type) => setWeeks((prev) => prev.map((w) => (w.id === id ? { ...w, type } : w)));

  const buildExercisesForWeek = (weekType) =>
    baseWorkout.workout_exercises.map((ex) => {
      const info = exerciseInfo[ex.name];
      const passthrough = { name: ex.name, isAssisted: info?.type === "assisted", periodizationEnabled: ex.periodization_enabled };
      if (!info?.type || !info?.anchor) return { ...passthrough, sets: ex.sets };
      const result = calcWeekTarget({ type: info.type, anchor: info.anchor, goal, weekType, bodyWeight: Number(bodyWeight) || undefined });
      const targetCount = ex.sets.length;
      const reps = result.reps || info.anchor.reps;
      const sets = Array.from({ length: targetCount }, () => ({ reps: String(reps).split("-")[0], weight: String(result.weight) }));
      return { ...passthrough, sets };
    });

  const handleCreateWeek = async (week) => {
    setCreating(week.id);
    const exercises = buildExercisesForWeek(week.type);
    await createWorkout(client.id, baseWorkout.title, exercises, week.type);
    setCreated((prev) => ({ ...prev, [week.id]: true }));
    setCreating(null);
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <TrendingUp size={15} color="var(--accent)" />
        <h3 className="fp-display font-semibold">Периодизация нагрузки</h3>
      </div>

      {workouts.length > 1 && (
        <div className="mb-3">
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>На основе тренировки</label>
          <select className="fp-input" value={selectedWorkoutId} onChange={(e) => setSelectedWorkoutId(e.target.value)}>
            {workouts.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Цель блока</label>
          <select className="fp-input" value={goal} onChange={(e) => setGoal(e.target.value)}>
            {GOAL_OPTIONS.map((g) => <option key={g} value={g}>{g} ({GOAL_CORRIDORS[g][0]}-{GOAL_CORRIDORS[g][1]}%)</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Вес клиента, кг</label>
          <input className="fp-input" type="number" value={bodyWeight} onChange={(e) => setBodyWeight(e.target.value)} placeholder="для ассист. упражнений" />
        </div>
      </div>

      {relevantSessions.length < 1 ? (
        <div className="fp-card p-4 mb-4" style={{ background: "var(--bg)" }}>
          <div className="flex items-start gap-2">
            <Zap size={15} color="var(--accent)" style={{ marginTop: 2, flexShrink: 0 }} />
            <p className="text-sm">
              Клиент ещё не завершил ни одной тренировки по «{baseWorkout.title}». Как только пройдёт первая (якорная) —
              здесь появится расчёт весов на основе того, что он реально поднимал.
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
            Якорный подход берётся из {relevantSessions.length} последних тренировок по «{baseWorkout.title}» — максимальный
            реально поднятый вес. Расчёт по формуле Бжицки (для базовых/ассистируемых) или пошаговой прогрессии
            (для изолирующих/унилатеральных), с учётом цели блока.
          </p>

          <div className="fp-card p-3 mb-4" style={{ background: "var(--bg)" }}>
            <div className="text-xs mb-2 font-semibold" style={{ color: "var(--ink-soft)" }}>УПРАЖНЕНИЯ В ТРЕНИРОВКЕ</div>
            <ul className="text-xs space-y-1">
              {baseWorkout.workout_exercises.map((ex) => {
                const info = exerciseInfo[ex.name];
                if (!info?.type) return <li key={ex.id} style={{ color: "var(--ink-soft)" }}>{ex.name} — не участвует</li>;
                if (!info.anchor) return <li key={ex.id} style={{ color: "var(--ink-soft)" }}>{ex.name} ({info.type}) — нет данных</li>;
                return <li key={ex.id}>{ex.name} — <b>{info.type}</b>, якорь {info.anchor.weight} кг × {info.anchor.reps}</li>;
              })}
            </ul>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs" style={{ color: "var(--ink-soft)" }}>Недели блока (после якорной)</label>
              <button onClick={addWeek} className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}><Plus size={12} /> Добавить неделю</button>
            </div>
            <div className="space-y-2">
              {weeks.map((week, idx) => (
                <div key={week.id} className="fp-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>Неделя {idx + 1}</span>
                    <div className="flex items-center gap-2">
                      {created[week.id] ? (
                        <span className="fp-chip" style={{ background: "var(--accent-2)", color: "#fff" }}>Создано ✓</span>
                      ) : (
                        <>
                          <button
                            className="fp-btn fp-btn-outline px-3 py-1.5 text-xs disabled:opacity-40"
                            disabled={creating === week.id || !hasEnoughData}
                            onClick={() => handleCreateWeek(week)}
                          >{creating === week.id ? "Создаём…" : "Создать"}</button>
                          {weeks.length > 1 && <button onClick={() => removeWeek(week.id)}><X size={14} color="var(--danger)" /></button>}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {WEEK_TYPE_OPTIONS.map((t) => (
                      <button
                        key={t} onClick={() => changeWeekType(week.id, t)}
                        className="fp-card px-2.5 py-1 text-xs"
                        style={{
                          borderColor: week.type === t ? WEEK_TYPE_META[t].color : "var(--line)",
                          borderWidth: week.type === t ? 1.5 : 1,
                          background: week.type === t ? WEEK_TYPE_META[t].color : "#fff",
                          color: week.type === t ? "#fff" : "var(--ink)",
                        }}
                      >{WEEK_TYPE_META[t].label}</button>
                    ))}
                  </div>
                  <ul className="text-xs space-y-0.5">
                    {baseWorkout.workout_exercises.map((ex) => {
                      const info = exerciseInfo[ex.name];
                      if (!info?.type || !info?.anchor) return null;
                      const result = calcWeekTarget({ type: info.type, anchor: info.anchor, goal, weekType: week.type, bodyWeight: Number(bodyWeight) || undefined });
                      return (
                        <li key={ex.id} style={{ color: "var(--ink-soft)" }}>
                          {ex.name} — {result.weight} кг{result.reps ? ` × ${result.reps}` : ""}
                          {info.type === "assisted" ? " (ассист)" : ""}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
