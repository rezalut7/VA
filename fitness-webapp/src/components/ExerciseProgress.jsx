import React, { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Target, Trophy, X, Plus, ChevronLeft } from "lucide-react";
import {
  fetchExerciseGoals, addExerciseGoal, deleteExerciseGoal,
  fetchSessionsForClient, fetchClientsForTrainer,
} from "../lib/api";

/* ---- вычисление статистики по упражнению из истории сессий ---- */

export function computeExerciseStats(sessions, exerciseName) {
  const points = []; // { date, maxWeight, maxReps, volume }
  sessions.forEach((s) => {
    const ex = (s.exercises || []).find((e) => e.name === exerciseName);
    if (!ex || !Array.isArray(ex.actualSets)) return;
    let maxWeight = 0, maxReps = 0, volume = 0;
    ex.actualSets.forEach((set) => {
      const w = parseFloat(set.weight) || 0;
      const r = parseFloat(set.reps) || 0;
      if (w > maxWeight) maxWeight = w;
      if (r > maxReps) maxReps = r;
      volume += w * r;
    });
    points.push({ date: s.finished_at, maxWeight, maxReps, volume });
  });
  return points.sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function listExerciseNames(sessions) {
  const names = new Set();
  sessions.forEach((s) => (s.exercises || []).forEach((e) => names.add(e.name)));
  return [...names].sort();
}

function bestOf(points, metric) {
  if (points.length === 0) return 0;
  return Math.max(...points.map((p) => p[metric]));
}

/* ------------------------------ КЛИЕНТ ------------------------------ */

function GoalCard({ goal, best, onDelete }) {
  const pct = goal.target_value > 0 ? Math.min(100, Math.round((best / goal.target_value) * 100)) : 0;
  const unit = goal.metric === "max_weight" ? "кг" : "повт.";
  return (
    <div className="fp-card p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{goal.exercise_name}</span>
        <button onClick={() => onDelete(goal.id)}><X size={14} color="var(--ink-soft)" /></button>
      </div>
      <div className="flex items-center justify-between mb-1 text-xs">
        <span style={{ color: "var(--ink-soft)" }}>{best} из {goal.target_value} {unit}</span>
        <span style={{ fontWeight: 600 }}>{pct}%</span>
      </div>
      <div className="fp-bar-track"><div className="fp-bar-fill" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--accent-2)" : "var(--accent)" }} /></div>
    </div>
  );
}

function AddGoalForm({ exerciseNames, onAdd, onCancel }) {
  const [name, setName] = useState(exerciseNames[0] || "");
  const [metric, setMetric] = useState("max_reps");
  const [target, setTarget] = useState("");

  return (
    <div className="fp-card p-4 mb-4" style={{ background: "var(--bg)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>НОВАЯ ЦЕЛЬ</span>
        <button onClick={onCancel}><X size={15} color="var(--ink-soft)" /></button>
      </div>
      <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Упражнение</label>
      {exerciseNames.length > 0 ? (
        <select className="fp-input mb-3" value={name} onChange={(e) => setName(e.target.value)}>
          {exerciseNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      ) : (
        <input className="fp-input mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Название упражнения" />
      )}
      <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Что измеряем</label>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button className="fp-card px-3 py-2 text-sm" style={{ borderColor: metric === "max_reps" ? "var(--accent)" : "var(--line)", borderWidth: metric === "max_reps" ? 1.5 : 1 }} onClick={() => setMetric("max_reps")}>Повторения</button>
        <button className="fp-card px-3 py-2 text-sm" style={{ borderColor: metric === "max_weight" ? "var(--accent)" : "var(--line)", borderWidth: metric === "max_weight" ? 1.5 : 1 }} onClick={() => setMetric("max_weight")}>Вес</button>
      </div>
      <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Цель ({metric === "max_weight" ? "кг" : "повторений"})</label>
      <input className="fp-input mb-3" type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
      <button className="fp-btn fp-btn-accent w-full py-2 text-sm disabled:opacity-40" disabled={!name || !target} onClick={() => onAdd(name, metric, Number(target))}>
        Добавить цель
      </button>
    </div>
  );
}

function ExerciseChart({ points, metric }) {
  if (points.length === 0) return <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Пока нет данных.</p>;
  const data = points.map((p) => ({ ...p, label: new Date(p.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }) }));
  return (
    <div style={{ width: "100%", height: 160 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="label" fontSize={10} stroke="var(--ink-soft)" />
          <YAxis fontSize={10} stroke="var(--ink-soft)" />
          <Tooltip />
          <Line type="monotone" dataKey={metric} stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExerciseProgressSection({ client }) {
  const [sessions, setSessions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [browseExercise, setBrowseExercise] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([fetchSessionsForClient(client.id), fetchExerciseGoals(client.id)]).then(([s, g]) => {
      setSessions(s); setGoals(g); setLoading(false);
    });
  };
  useEffect(() => { load(); }, [client.id]);

  if (loading) return <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>;

  const exerciseNames = listExerciseNames(sessions);

  const handleAddGoal = async (name, metric, target) => {
    await addExerciseGoal(client.id, name, metric, target);
    setShowAddGoal(false);
    load();
  };
  const handleDeleteGoal = async (id) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    await deleteExerciseGoal(id);
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <Target size={15} color="var(--accent)" />
        <h3 className="fp-display font-semibold">Цели по упражнениям</h3>
      </div>

      {goals.map((g) => {
        const points = computeExerciseStats(sessions, g.exercise_name);
        const best = bestOf(points, g.metric === "max_weight" ? "maxWeight" : "maxReps");
        return <GoalCard key={g.id} goal={g} best={best} onDelete={handleDeleteGoal} />;
      })}

      {showAddGoal ? (
        <AddGoalForm exerciseNames={exerciseNames} onAdd={handleAddGoal} onCancel={() => setShowAddGoal(false)} />
      ) : (
        <button className="text-xs flex items-center gap-1 mb-5" style={{ color: "var(--accent)" }} onClick={() => setShowAddGoal(true)}>
          <Plus size={12} /> Добавить цель
        </button>
      )}

      {exerciseNames.length > 0 && (
        <div className="fp-card p-4">
          <div className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>ПРОГРЕСС ПО УПРАЖНЕНИЮ</div>
          <select className="fp-input mb-3" value={browseExercise} onChange={(e) => setBrowseExercise(e.target.value)}>
            <option value="">Выберите упражнение…</option>
            {exerciseNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {browseExercise && (
            <>
              {(() => {
                const points = computeExerciseStats(sessions, browseExercise);
                return (
                  <>
                    <div className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>Максимальный вес, кг</div>
                    <ExerciseChart points={points} metric="maxWeight" />
                    <div className="text-xs mb-1 mt-3" style={{ color: "var(--ink-soft)" }}>Объём за тренировку (повт. × вес)</div>
                    <ExerciseChart points={points} metric="volume" />
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ ТРЕНЕР: РЕЙТИНГ ------------------------------ */

export function TrainerLeaderboard({ trainer, clients, onBack }) {
  const [allData, setAllData] = useState([]); // [{ client, sessions }]
  const [loading, setLoading] = useState(true);
  const [exerciseName, setExerciseName] = useState("");
  const [metric, setMetric] = useState("max_weight");

  useEffect(() => {
    setLoading(true);
    Promise.all(clients.map((c) => fetchSessionsForClient(c.id).then((s) => ({ client: c, sessions: s })))).then((res) => {
      setAllData(res);
      setLoading(false);
    });
  }, [clients.length]);

  if (loading) return <p className="text-sm px-4" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>;

  const allNames = new Set();
  allData.forEach(({ sessions }) => listExerciseNames(sessions).forEach((n) => allNames.add(n)));
  const exerciseNames = [...allNames].sort();

  const rows = exerciseName
    ? allData
        .map(({ client, sessions }) => {
          const points = computeExerciseStats(sessions, exerciseName);
          const best = bestOf(points, metric === "max_weight" ? "maxWeight" : "maxReps");
          return { client, best };
        })
        .filter((r) => r.best > 0)
        .sort((a, b) => b.best - a.best)
    : [];

  return (
    <div className="px-4">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
          <ChevronLeft size={16} /> К обзору
        </button>
      )}
      <div className="flex items-center gap-1.5 mb-3">
        <Trophy size={15} color="var(--accent)" />
        <h2 className="fp-display text-xl font-semibold">Рейтинг по упражнению</h2>
      </div>

      {exerciseNames.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Пока нет завершённых тренировок ни у одного клиента.</p>
      ) : (
        <>
          <select className="fp-input mb-3" value={exerciseName} onChange={(e) => setExerciseName(e.target.value)}>
            <option value="">Выберите упражнение…</option>
            {exerciseNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {exerciseName && (
            <div className="flex gap-2 mb-4">
              <button className="fp-card px-3 py-1.5 text-xs flex-1" style={{ borderColor: metric === "max_weight" ? "var(--accent)" : "var(--line)", borderWidth: metric === "max_weight" ? 1.5 : 1 }} onClick={() => setMetric("max_weight")}>По весу</button>
              <button className="fp-card px-3 py-1.5 text-xs flex-1" style={{ borderColor: metric === "max_reps" ? "var(--accent)" : "var(--line)", borderWidth: metric === "max_reps" ? 1.5 : 1 }} onClick={() => setMetric("max_reps")}>По повторениям</button>
            </div>
          )}
          {exerciseName && (
            rows.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Ни один клиент ещё не выполнял это упражнение с записанным результатом.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={r.client.id} className="fp-card p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="fp-display font-bold" style={{ width: 24, color: i === 0 ? "var(--accent)" : "var(--ink-soft)" }}>{i + 1}</span>
                      <span className="text-sm font-medium">{r.client.name}</span>
                    </div>
                    <span className="text-sm font-semibold">{r.best} {metric === "max_weight" ? "кг" : "повт."}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
