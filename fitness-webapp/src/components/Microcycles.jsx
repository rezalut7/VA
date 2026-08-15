import React, { useState, useEffect } from "react";
import { Trash2, CalendarDays, Zap, Plus, X } from "lucide-react";
import { AssignWorkoutForm, formatSets } from "./Workouts";
import { WEEK_PLAN, effectiveWeightMult, adjustReps } from "./Templates";
import { fetchMicrocycles, createMicrocycle, deleteMicrocycle, createWorkout } from "../lib/api";

function MicrocycleBuilder({ onSave, onCancel }) {
  const [title, setTitle] = useState("");
  const [days, setDays] = useState([]);
  const [addingDay, setAddingDay] = useState(false);
  const [busy, setBusy] = useState(false);

  const finishDay = (dayTitle, items) => {
    setDays((prev) => [...prev, { title: dayTitle, items }]);
    setAddingDay(false);
  };
  const removeDay = (idx) => setDays((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    setBusy(true);
    await onSave(title.trim(), days);
    setBusy(false);
  };

  return (
    <div className="fp-card p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="fp-display font-semibold">Новый микроцикл</h3>
        <button onClick={onCancel}><X size={18} color="var(--ink-soft)" /></button>
      </div>
      <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Название микроцикла</label>
      <input className="fp-input mb-4" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Сплит на 3 дня" />

      {days.length > 0 && (
        <div className="space-y-2 mb-4">
          {days.map((d, idx) => (
            <div key={idx} className="fp-card p-3 flex items-center justify-between" style={{ background: "var(--bg)" }}>
              <div>
                <div className="text-sm font-medium">{d.title}</div>
                <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{d.items.length} упражнений</div>
              </div>
              <button onClick={() => removeDay(idx)}><Trash2 size={15} color="var(--danger)" /></button>
            </div>
          ))}
        </div>
      )}

      {addingDay ? (
        <AssignWorkoutForm onAssign={finishDay} onCancel={() => setAddingDay(false)} />
      ) : (
        <button className="fp-btn fp-btn-outline w-full py-2.5 mb-4 flex items-center justify-center gap-2" onClick={() => setAddingDay(true)}>
          <Plus size={14} /> Добавить день
        </button>
      )}

      <button
        className="fp-btn fp-btn-accent w-full py-2.5 disabled:opacity-40"
        disabled={!title.trim() || days.length === 0 || busy}
        onClick={save}
      >
        {busy ? "Сохраняем…" : `Сохранить микроцикл (${days.length} ${days.length === 1 ? "день" : "дня"})`}
      </button>
    </div>
  );
}

export function MicrocycleManager({ trainer }) {
  const [microcycles, setMicrocycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);

  const load = () => { setLoading(true); fetchMicrocycles(trainer.id).then((m) => { setMicrocycles(m); setLoading(false); }); };
  useEffect(() => { load(); }, [trainer.id]);

  const handleSave = async (title, days) => {
    await createMicrocycle(trainer.id, title, days);
    setBuilding(false);
    load();
  };
  const handleDelete = async (id) => {
    setMicrocycles((prev) => prev.filter((m) => m.id !== id));
    await deleteMicrocycle(id);
  };

  return (
    <div className="px-4">
      <div className="flex items-center gap-1.5 mb-3">
        <CalendarDays size={15} color="var(--accent)" />
        <h2 className="fp-display text-xl font-semibold">Микроциклы</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
        Шаблон не на одну тренировку, а сразу на несколько дней (например «День 1 — грудь, День 2 — спина, День 3 — ноги»).
        При назначении клиенту можно сразу развернуть его в периодизированный 4-недельный блок.
      </p>

      {building ? (
        <MicrocycleBuilder onSave={handleSave} onCancel={() => setBuilding(false)} />
      ) : (
        <button className="fp-btn fp-btn-accent px-4 py-2.5 mb-5" onClick={() => setBuilding(true)}>+ Новый микроцикл</button>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>
      ) : microcycles.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Микроциклов пока нет.</p>
      ) : (
        <div className="space-y-3">
          {microcycles.map((m) => (
            <div key={m.id} className="fp-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">{m.title}</div>
                <button onClick={() => handleDelete(m.id)}><Trash2 size={15} color="var(--danger)" /></button>
              </div>
              <div className="space-y-2">
                {m.workouts.map((w) => (
                  <div key={w.id}>
                    <div className="text-xs font-semibold mb-1" style={{ color: "var(--ink-soft)" }}>{w.title}</div>
                    <ul className="text-xs space-y-0.5 pl-2" style={{ color: "var(--ink-soft)" }}>
                      {w.exercises.map((e) => <li key={e.id}>{e.name} — {formatSets(e.sets)}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssignMicrocycle({ trainer, clientId, onAssigned }) {
  const [microcycles, setMicrocycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [withPeriodization, setWithPeriodization] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchMicrocycles(trainer.id).then((m) => { setMicrocycles(m); setLoading(false); }); }, [trainer.id]);

  const selected = microcycles.find((m) => m.id === selectedId);

  const buildPeriodizedExercises = (exercises, week) =>
    exercises.map((ex) => {
      const passthrough = { name: ex.name, isAssisted: ex.is_assisted, periodizationEnabled: ex.periodization_enabled };
      if (ex.periodization_enabled === false) return { ...passthrough, sets: ex.sets };
      const baseWeight = parseFloat(ex.sets[0]?.weight);
      if (!baseWeight || isNaN(baseWeight)) return { ...passthrough, sets: ex.sets };
      const mult = effectiveWeightMult(ex, week);
      const weight = Math.max(0, Math.round(baseWeight * mult));
      const count = Math.max(1, Math.round(ex.sets.length * week.setsMult));
      const reps = adjustReps(ex.sets[0]?.reps || "10", week.repDelta);
      const sets = Array.from({ length: count }, () => ({ reps, weight: String(weight) }));
      return { ...passthrough, sets };
    });

  const assign = async () => {
    if (!selected) return;
    setBusy(true);
    if (!withPeriodization) {
      for (const day of selected.workouts) {
        await createWorkout(
          clientId, `${selected.title} — ${day.title}`,
          day.exercises.map((e) => ({ name: e.name, sets: e.sets, isAssisted: e.is_assisted, periodizationEnabled: e.periodization_enabled }))
        );
      }
    } else {
      // Важно: сначала перебираем недели, потом дни — так клиент получает
      // сначала все тренировки лёгкой недели по порядку микроцикла, потом
      // все тренировки средней и т.д., а не все 4 недели одного дня подряд.
      for (const week of WEEK_PLAN) {
        for (const day of selected.workouts) {
          const exercises = buildPeriodizedExercises(day.exercises, week);
          await createWorkout(clientId, `${selected.title} — ${day.title}`, exercises, week.dbTag);
        }
      }
    }
    setBusy(false);
    onAssigned?.();
  };

  if (loading) return <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Загрузка микроциклов…</p>;
  if (microcycles.length === 0) return <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Микроциклов пока нет — создайте их на Обзоре.</p>;

  return (
    <div>
      <div className="space-y-2 mb-3">
        {microcycles.map((m) => (
          <button
            key={m.id} onClick={() => setSelectedId(m.id)}
            className="fp-card w-full p-3 text-left"
            style={{ borderColor: selectedId === m.id ? "var(--accent)" : "var(--line)", borderWidth: selectedId === m.id ? 1.5 : 1 }}
          >
            <div className="text-sm font-medium">{m.title}</div>
            <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{m.workouts.length} {m.workouts.length === 1 ? "день" : "дня"}</div>
          </button>
        ))}
      </div>

      {selected && (
        <>
          <label className="flex items-start gap-2 text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            <input type="checkbox" checked={withPeriodization} onChange={(e) => setWithPeriodization(e.target.checked)} style={{ marginTop: 2 }} />
            <span>
              <b style={{ color: "var(--ink)" }}>Сразу развернуть в 4-недельный блок с периодизацией</b> — вес из шаблона берётся
              как «неделя 1», дальше рост объёма → пик → разгрузка, как в разделе «Периодизация». Создаст {selected.workouts.length * 4} тренировок сразу.
            </span>
          </label>
          <button className="fp-btn fp-btn-accent w-full py-2.5 disabled:opacity-40 flex items-center justify-center gap-2" disabled={busy} onClick={assign}>
            <Zap size={14} /> {busy ? "Назначаем…" : "Назначить клиенту"}
          </button>
        </>
      )}
    </div>
  );
}
