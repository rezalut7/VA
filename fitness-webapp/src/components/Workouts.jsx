import React, { useState, useEffect } from "react";
import { Plus, X, Trash2, ArrowUp, ArrowDown, Timer, Play, Pause, Flag, CheckCircle2 } from "lucide-react";
import { EXERCISE_GROUPS } from "../data/exerciseGroups";
import { useExerciseDetail, ExerciseDescriptionBlock, ExerciseVideoBlock } from "./ExerciseLibrary";

/* --------------------------------- HELPERS -------------------------------- */

export function formatSets(sets) {
  return (sets || []).map((s) => (s.weight ? `${s.reps}×${s.weight} кг` : `${s.reps}`)).join(" · ");
}

export function formatDuration(totalSeconds) {
  const total = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function pluralizeRu(n, [one, few, many]) {
  const num = Math.abs(Number(n)) || 0;
  const mod100 = num % 100;
  const mod10 = num % 10;
  if (mod100 > 10 && mod100 < 20) return many;
  if (mod10 === 1) return one;
  if (mod10 > 1 && mod10 < 5) return few;
  return many;
}

function formatCardioTime(hours, minutes) {
  const h = Number(hours) || 0;
  const m = Number(minutes) || 0;
  const parts = [];
  if (h > 0) parts.push(`${h} ${pluralizeRu(h, ["час", "часа", "часов"])}`);
  if (m > 0 || h === 0) parts.push(`${m} ${pluralizeRu(m, ["минута", "минуты", "минут"])}`);
  return parts.join(" ");
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const DEFAULT_SETS = () => [{ reps: "10", weight: "" }, { reps: "10", weight: "" }, { reps: "10", weight: "" }];

/* -------------------------------- WIDGETS -------------------------------- */

function ChipSelect({ options, value, onChange, allowNone = true, noneLabel = "Без уточнения" }) {
  const chipStyle = (selected) => ({
    borderColor: selected ? "var(--accent)" : "var(--line)",
    borderWidth: selected ? 1.5 : 1,
    background: selected ? "var(--accent)" : "var(--surface)",
    color: selected ? "#fff" : "var(--ink)",
  });
  return (
    <div className="flex flex-wrap gap-1.5">
      {allowNone && (
        <button type="button" onClick={() => onChange("")} className="fp-card px-2.5 py-1.5 text-xs" style={chipStyle(value === "")}>
          {noneLabel}
        </button>
      )}
      {options.map((opt) => (
        <button type="button" key={opt} onClick={() => onChange(opt)} className="fp-card px-2.5 py-1.5 text-xs" style={chipStyle(value === opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function SetsEditor({ sets, onChange }) {
  const updateSet = (idx, patch) => onChange(sets.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const removeSet = (idx) => onChange(sets.filter((_, i) => i !== idx));
  const addSet = () => onChange([...sets, { reps: "10", weight: "" }]);

  return (
    <div className="mb-3">
      <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Подходы (повторения × вес)</label>
      <div className="space-y-1.5 mb-2">
        {sets.map((s, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--ink-soft)", width: 16 }}>{idx + 1}</span>
            <input className="fp-input" style={{ width: 68 }} value={s.reps} onChange={(e) => updateSet(idx, { reps: e.target.value })} placeholder="Повт." />
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>×</span>
            <input className="fp-input" style={{ width: 76 }} type="number" min="0" value={s.weight} onChange={(e) => updateSet(idx, { weight: e.target.value })} placeholder="Вес" />
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>кг</span>
            {sets.length > 1 && (
              <button type="button" onClick={() => removeSet(idx)} className="ml-auto"><X size={14} color="var(--danger)" /></button>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addSet} className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}>
        <Plus size={12} /> Добавить подход
      </button>
    </div>
  );
}

function ExercisePicker({ onAdd }) {
  const [groupIdx, setGroupIdx] = useState(0);
  const [exIdx, setExIdx] = useState(0);
  const [equipment, setEquipment] = useState("");
  const [side, setSide] = useState("");
  const [width, setWidth] = useState("");
  const [grip, setGrip] = useState("");
  const [variant, setVariant] = useState("");
  const [sets, setSets] = useState(DEFAULT_SETS());
  const [timeHours, setTimeHours] = useState(0);
  const [timeMinutes, setTimeMinutes] = useState(20);
  const [repsValue, setRepsValue] = useState(15);
  const [distanceValue, setDistanceValue] = useState(5);
  const [isAssisted, setIsAssisted] = useState(false);
  const [periodizationEnabled, setPeriodizationEnabled] = useState(true);

  const group = EXERCISE_GROUPS[groupIdx];
  const exercise = group.exercises[exIdx];
  const isCardio = group.name === "Кардио";

  const resetCardioDefaults = () => { setTimeHours(0); setTimeMinutes(20); setRepsValue(15); setDistanceValue(5); };
  const resetDimensions = () => { setSide(""); setWidth(""); setGrip(""); setVariant(""); };

  const applyAssistedAutoDetect = (eq) => {
    setIsAssisted(eq === "Гравитрон" || eq === "Резинка");
  };

  const changeGroup = (idx) => {
    const g = EXERCISE_GROUPS[idx];
    setGroupIdx(idx); setExIdx(0);
    const eq = g.name === "Кардио" ? (g.exercises[0].equipment[0] || "") : "";
    setEquipment(eq);
    resetDimensions(); resetCardioDefaults();
    applyAssistedAutoDetect(eq);
    setPeriodizationEnabled(true);
  };
  const changeExercise = (idx) => {
    setExIdx(idx);
    const eq = isCardio ? (group.exercises[idx].equipment[0] || "") : "";
    setEquipment(eq);
    resetDimensions(); resetCardioDefaults();
    applyAssistedAutoDetect(eq);
    setPeriodizationEnabled(true);
  };
  const changeEquipment = (eq) => { setEquipment(eq); applyAssistedAutoDetect(eq); };

  // Отображаемое название собирается из всех выбранных измерений по порядку.
  const composedName = [group.name, exercise.name, equipment || null, side || null, width || null, grip || null, variant || null]
    .filter(Boolean).join(" - ");

  const submit = () => {
    if (isCardio) {
      let value = "—";
      if (equipment === "По времени") value = formatCardioTime(timeHours, timeMinutes);
      else if (equipment === "По дистанции") value = `${distanceValue} км`;
      else if (equipment === "По повторениям") value = `${repsValue} ${pluralizeRu(repsValue, ["повторение", "повторения", "повторений"])}`;
      onAdd({
        id: uid(), name: composedName, sets: [{ reps: value, weight: "" }],
        isAssisted: false, periodizationEnabled: false, baseName: exercise.name, equipment: null, side: null,
      });
      resetCardioDefaults();
    } else {
      onAdd({
        id: uid(), name: composedName, sets, isAssisted, periodizationEnabled,
        baseName: exercise.name, equipment: equipment || null, side: side || null,
      });
      setSets(DEFAULT_SETS());
    }
  };

  return (
    <div className="fp-card p-4 mb-4" style={{ background: "var(--bg)" }}>
      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Группа мышц</label>
          <select className="fp-input" value={groupIdx} onChange={(e) => changeGroup(Number(e.target.value))}>
            {EXERCISE_GROUPS.map((g, i) => <option key={g.name} value={i}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Упражнение</label>
          <select className="fp-input" value={exIdx} onChange={(e) => changeExercise(Number(e.target.value))}>
            {group.exercises.map((ex, i) => <option key={ex.name} value={i}>{ex.name}</option>)}
          </select>
        </div>
      </div>

      {exercise.equipment.length > 0 && (
        <div className="mb-3">
          <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>{isCardio ? "Как измеряем" : "Снаряд"}</label>
          <ChipSelect options={exercise.equipment} value={equipment} onChange={changeEquipment} allowNone={!isCardio} />
        </div>
      )}

      {!isCardio && exercise.side.length > 0 && (
        <div className="mb-3">
          <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Рабочая сторона</label>
          <ChipSelect options={exercise.side} value={side} onChange={setSide} />
        </div>
      )}

      {!isCardio && exercise.width.length > 0 && (
        <div className="mb-3">
          <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Ширина хвата</label>
          <ChipSelect options={exercise.width} value={width} onChange={setWidth} />
        </div>
      )}

      {!isCardio && exercise.grip.length > 0 && (
        <div className="mb-3">
          <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Тип хвата</label>
          <ChipSelect options={exercise.grip} value={grip} onChange={setGrip} />
        </div>
      )}

      {!isCardio && exercise.variant.length > 0 && (
        <div className="mb-3">
          <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Вариант</label>
          <ChipSelect options={exercise.variant} value={variant} onChange={setVariant} />
        </div>
      )}

      {isCardio ? (
        <div className="mb-3">
          {equipment === "По времени" && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Время</label>
              <div className="flex items-center gap-2">
                <input className="fp-input" style={{ width: 70 }} type="number" min="0" value={timeHours} onChange={(e) => setTimeHours(e.target.value)} />
                <span className="text-xs" style={{ color: "var(--ink-soft)" }}>ч</span>
                <input className="fp-input" style={{ width: 70 }} type="number" min="0" max="59" value={timeMinutes} onChange={(e) => setTimeMinutes(e.target.value)} />
                <span className="text-xs" style={{ color: "var(--ink-soft)" }}>мин</span>
              </div>
            </div>
          )}
          {equipment === "По дистанции" && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Дистанция, км</label>
              <input className="fp-input" style={{ width: 120 }} type="number" min="0" step="0.1" value={distanceValue} onChange={(e) => setDistanceValue(e.target.value)} />
            </div>
          )}
          {equipment === "По повторениям" && (
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Повторения</label>
              <input className="fp-input" style={{ width: 100 }} type="number" min="0" value={repsValue} onChange={(e) => setRepsValue(e.target.value)} />
            </div>
          )}
        </div>
      ) : (
        <SetsEditor sets={sets} onChange={setSets} />
      )}

      {!isCardio && (
        <div className="flex flex-col gap-2 mb-3">
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-soft)" }}>
            <input type="checkbox" checked={periodizationEnabled} onChange={(e) => setPeriodizationEnabled(e.target.checked)} />
            Учитывать в периодизации нагрузки
          </label>
        </div>
      )}

      <div className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
        <span style={{ fontWeight: 600, color: "var(--ink)" }}>{composedName}</span>
      </div>

      <button type="button" className="fp-btn fp-btn-accent w-full py-2 text-sm flex items-center justify-center gap-1.5" onClick={submit}>
        <Plus size={14} /> Добавить в тренировку
      </button>
    </div>
  );
}

export function AssignWorkoutForm({ onAssign, onCancel }) {
  const [title, setTitle] = useState("");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [roundsInput, setRoundsInput] = useState(3);

  const addItem = (item) => setItems((prev) => [...prev, item]);
  const removeItem = (id) => setItems((prev) => prev.filter((x) => x.id !== id));
  const moveItem = (id, dir) => setItems((prev) => {
    const idx = prev.findIndex((x) => x.id === id);
    const next = idx + dir;
    if (idx === -1 || next < 0 || next >= prev.length) return prev;
    const copy = [...prev];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    return copy;
  });

  const toggleSelect = (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const mergeIntoCircuit = () => {
    if (selectedIds.length < 2) return;
    const circuitId = uid();
    setItems((prev) => prev.map((it) => (selectedIds.includes(it.id) ? { ...it, circuitId, circuitRounds: Number(roundsInput) || 2 } : it)));
    setSelectedIds([]);
  };

  const ungroupCircuit = (circuitId) => {
    setItems((prev) => prev.map((it) => (it.circuitId === circuitId ? { ...it, circuitId: null, circuitRounds: null } : it)));
  };

  const submit = async () => {
    if (!title.trim() || items.length === 0) return;
    setBusy(true);
    await onAssign(title.trim(), items);
    setBusy(false);
  };

  return (
    <div className="fp-card p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="fp-display font-semibold">Новое задание</h3>
        <button type="button" onClick={onCancel}><X size={18} color="var(--ink-soft)" /></button>
      </div>
      <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Название тренировки</label>
      <input className="fp-input mb-4" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Ноги + кор" />

      <ExercisePicker onAdd={addItem} />

      {items.length > 0 && (
        <div className="space-y-2 mb-3 fp-scroll" style={{ maxHeight: 300, overflowY: "auto" }}>
          {(() => {
            const renderedCircuits = new Set();
            return items.map((it, idx) => {
              if (it.circuitId) {
                if (renderedCircuits.has(it.circuitId)) return null;
                renderedCircuits.add(it.circuitId);
                const group = items.filter((x) => x.circuitId === it.circuitId);
                return (
                  <div key={it.circuitId} className="fp-card p-2" style={{ borderColor: "var(--accent)", borderWidth: 1.5, background: "var(--bg)" }}>
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Круг × {it.circuitRounds}</span>
                      <button type="button" onClick={() => ungroupCircuit(it.circuitId)} className="text-xs" style={{ color: "var(--ink-soft)" }}>Разъединить</button>
                    </div>
                    <div className="space-y-1.5">
                      {group.map((g) => (
                        <div key={g.id} className="flex items-center gap-2 fp-card px-2.5 py-1.5" style={{ background: "var(--surface)" }}>
                          <div className="text-sm flex-1">
                            <div>{g.name}</div>
                            <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{formatSets(g.sets)}</div>
                          </div>
                          <button type="button" onClick={() => removeItem(g.id)}><Trash2 size={15} color="var(--danger)" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <div key={it.id} className="flex items-center gap-2 fp-card px-3 py-2">
                  <input type="checkbox" checked={selectedIds.includes(it.id)} onChange={() => toggleSelect(it.id)} />
                  <div className="flex flex-col">
                    <button type="button" onClick={() => moveItem(it.id, -1)} disabled={idx === 0} className="disabled:opacity-25"><ArrowUp size={13} color="var(--ink-soft)" /></button>
                    <button type="button" onClick={() => moveItem(it.id, 1)} disabled={idx === items.length - 1} className="disabled:opacity-25"><ArrowDown size={13} color="var(--ink-soft)" /></button>
                  </div>
                  <div className="text-sm flex-1">
                    <div>{it.name}</div>
                    <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{formatSets(it.sets)}</div>
                  </div>
                  <button type="button" onClick={() => removeItem(it.id)}><Trash2 size={16} color="var(--danger)" /></button>
                </div>
              );
            });
          })()}
        </div>
      )}

      {selectedIds.length >= 2 && (
        <div className="fp-card p-3 mb-4 flex items-center gap-2" style={{ background: "var(--bg)" }}>
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Объединить {selectedIds.length} упр. в круг ×</span>
          <input className="fp-input" style={{ width: 56, padding: "6px 8px" }} type="number" min="2" value={roundsInput} onChange={(e) => setRoundsInput(e.target.value)} />
          <button type="button" className="fp-btn fp-btn-accent px-3 py-1.5 text-xs ml-auto" onClick={mergeIntoCircuit}>Готово</button>
        </div>
      )}

      <button type="button" className="fp-btn fp-btn-accent w-full py-2.5 disabled:opacity-40" disabled={!title.trim() || items.length === 0 || busy} onClick={submit}>
        {busy ? "Назначаем…" : `Назначить клиенту ${items.length > 0 ? `(${items.length})` : ""}`}
      </button>
    </div>
  );
}

/* ------------------------------ WORKOUT SESSION ------------------------------ */

// Разворачивает упражнения в последовательность шагов: обычные упражнения —
// один шаг, упражнения одного круга — по шагу на каждый раунд, круги идут
// один за другим (несколько кругов подряд отображаются клиенту итеративно).
function buildSteps(exercises) {
  const steps = [];
  let i = 0;
  while (i < exercises.length) {
    const ex = exercises[i];
    if (ex.circuit_id) {
      const group = [];
      let j = i;
      while (j < exercises.length && exercises[j].circuit_id === ex.circuit_id) { group.push(exercises[j]); j++; }
      const rounds = ex.circuit_rounds || 1;
      for (let r = 0; r < rounds; r++) {
        steps.push({ key: `${ex.circuit_id}-r${r}`, isCircuit: true, exercises: group, setIndex: r, roundNumber: r + 1, totalRounds: rounds });
      }
      i = j;
    } else {
      steps.push({ key: ex.id, isCircuit: false, exercise: ex, setIndex: null, roundNumber: null, totalRounds: null });
      i += 1;
    }
  }
  return steps;
}

export function WorkoutSession({ workout, onExit, onFinish }) {
  const [exIndex, setExIndex] = useState(0);
  const [exerciseOrder, setExerciseOrder] = useState(workout.workout_exercises);
  const [log, setLog] = useState(() => {
    const initial = {};
    workout.workout_exercises.forEach((ex) => {
      if (ex.circuit_id) {
        const rounds = ex.circuit_rounds || 1;
        const template = ex.sets[0] || { reps: "10", weight: "" };
        initial[ex.id] = { sets: Array.from({ length: rounds }, () => ({ reps: template.reps, weight: template.weight, done: false })), done: false };
      } else {
        initial[ex.id] = { sets: ex.sets.map((s) => ({ reps: s.reps, weight: s.weight, done: false })), done: false };
      }
    });
    return initial;
  });
  const [startedAt] = useState(() => Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);
  const [rest, setRest] = useState({ active: false, secondsLeft: 0 });
  const [cardio, setCardio] = useState({ running: false, elapsedSec: 0 });
  const [confirmExit, setConfirmExit] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [exerciseNotes, setExerciseNotes] = useState({});
  const [sessionNote, setSessionNote] = useState("");

  useEffect(() => {
    const t = setInterval(() => {
      setElapsedSec((s) => s + 1);
      setRest((r) => (r.active ? (r.secondsLeft <= 1 ? { active: false, secondsLeft: 0 } : { ...r, secondsLeft: r.secondsLeft - 1 }) : r));
      setCardio((c) => (c.running ? { ...c, elapsedSec: c.elapsedSec + 1 } : c));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const exercises = exerciseOrder;
  const steps = buildSteps(exercises);
  const currentStep = steps[Math.min(exIndex, steps.length - 1)];
  const isCircuitStep = currentStep.isCircuit;
  const exercise = isCircuitStep ? null : currentStep.exercise;
  const isCardio = !isCircuitStep && exercise.name.startsWith("Кардио");
  const exLog = isCircuitStep ? null : log[exercise.id];
  const totalSteps = steps.length;
  const isStepDone = (step) => {
    if (step.isCircuit) return step.exercises.every((ex) => !!log[ex.id]?.sets[step.setIndex]?.done);
    const l = log[step.exercise.id];
    return l ? l.done : false;
  };
  const doneStepsCount = steps.filter(isStepDone).length;
  const isLast = exIndex === totalSteps - 1;
  const { detail: exerciseDetail, loading: exerciseDetailLoading } = useExerciseDetail(isCircuitStep ? null : exercise);
  const circuitRoundComplete = isCircuitStep && currentStep.exercises.every((ex) => log[ex.id]?.sets[currentStep.setIndex]?.done);

  // Тренажёр занят — переносим текущее упражнение на позицию сразу после
  // следующего, не отмечая выполненным. Доступно только вне круга (внутри
  // круга порядок раундов менять некуда). exIndex не меняем — после свапа
  // на этом месте окажется то, что раньше шло следующим.
  const postponeExercise = () => {
    if (isCircuitStep || exIndex >= steps.length - 1) return;
    setExerciseOrder((prev) => {
      const idx = prev.findIndex((e) => e.id === exercise.id);
      if (idx === -1 || idx >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr;
    });
  };

  const updateSet = (exId, setIdx, patch) => {
    setLog((prev) => {
      const exState = prev[exId];
      const nextSets = exState.sets.map((s, i) => (i === setIdx ? { ...s, ...patch } : s));
      return { ...prev, [exId]: { sets: nextSets, done: nextSets.every((s) => s.done) } };
    });
  };
  const toggleSetDone = (exId, setIdx) => {
    const wasDone = log[exId].sets[setIdx].done;
    updateSet(exId, setIdx, { done: !wasDone });
    if (!wasDone) setRest({ active: true, secondsLeft: 60 });
  };
  const toggleCardioDone = () => {
    setLog((prev) => ({ ...prev, [exercise.id]: { ...prev[exercise.id], done: !prev[exercise.id].done } }));
  };
  const addExtraSet = () => {
    setLog((prev) => {
      const exState = prev[exercise.id];
      const last = exState.sets[exState.sets.length - 1] || { reps: "10", weight: "" };
      const nextSets = [...exState.sets, { reps: last.reps, weight: last.weight, done: false }];
      return { ...prev, [exercise.id]: { sets: nextSets, done: false } };
    });
  };
  const [rating, setRating] = useState(0);
  const cardioIsTimed = !isCircuitStep && isCardio && /мин|час/.test(exercise.sets[0].reps);

  const finish = async () => {
    setFinishing(true);
    const exercisesPayload = exercises.map((ex) => ({
      id: ex.id, name: ex.name, plannedSets: ex.sets, actualSets: log[ex.id].sets, done: log[ex.id].done,
      note: (exerciseNotes[ex.id] || "").trim() || null,
    }));
    await onFinish({
      workoutId: workout.id, title: workout.title, startedAt,
      finishedAt: Date.now(), durationSec: elapsedSec, exercises: exercisesPayload,
      note: sessionNote.trim() || null, rating: rating || null,
    });
  };

  return (
    <div className="min-h-screen fp-safe-top px-4 pb-6 max-w-lg mx-auto flex flex-col" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)" }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="fp-display text-lg font-semibold">{workout.title}</div>
          <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {isCircuitStep ? `Круг · упражнение ${exIndex + 1} из ${totalSteps}` : `Упражнение ${exIndex + 1} из ${totalSteps}`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold flex items-center gap-1"><Timer size={14} color="var(--ink-soft)" /> {formatDuration(elapsedSec)}</span>
          <button type="button" onClick={() => setConfirmExit(true)}><X size={20} color="var(--ink-soft)" /></button>
        </div>
      </div>

      <div className="fp-bar-track mb-3"><div className="fp-bar-fill" style={{ width: `${(doneStepsCount / totalSteps) * 100}%`, background: "var(--accent-2)" }} /></div>

      <div className="fp-card p-4 mb-3 flex-1">
        {isCircuitStep ? (
          <>
            <div className="fp-display text-lg font-semibold mb-1">Круг {currentStep.roundNumber} из {currentStep.totalRounds}</div>
            <div className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
              {currentStep.exercises.map((e) => e.name).join(" → ")}
            </div>
            <div className="space-y-3">
              {currentStep.exercises.map((ex) => {
                const set = log[ex.id].sets[currentStep.setIndex];
                return (
                  <div key={ex.id} className="fp-card p-3" style={{ borderColor: set.done ? "var(--accent-2)" : "var(--line)", borderWidth: 1.5, background: "var(--bg)" }}>
                    <div className="text-sm font-semibold mb-2">{ex.name}</div>
                    <div className="flex items-center gap-2">
                      <input className="fp-input" style={{ width: 70, padding: "6px 8px" }} value={set.reps} onChange={(e) => updateSet(ex.id, currentStep.setIndex, { reps: e.target.value })} />
                      <span className="text-xs" style={{ color: "var(--ink-soft)" }}>×</span>
                      <input className="fp-input" style={{ width: 80, padding: "6px 8px" }} value={set.weight} onChange={(e) => updateSet(ex.id, currentStep.setIndex, { weight: e.target.value })} placeholder="кг" />
                      <span className="text-xs" style={{ color: "var(--ink-soft)" }}>кг</span>
                      <div className="fp-checkbox" style={{ marginLeft: "auto", borderRadius: 8, width: 34, height: 34 }} onClick={() => toggleSetDone(ex.id, currentStep.setIndex)}>
                        {set.done && <CheckCircle2 size={19} color="#fff" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="fp-display text-lg font-semibold mb-2.5">{exercise.name}</div>

            <ExerciseDescriptionBlock detail={exerciseDetail} loading={exerciseDetailLoading} />

            {isCardio ? (
          <div>
            <div className="fp-card p-3 mb-3 text-center" style={{ background: "var(--bg)" }}>
              <div className="text-xs mb-1" style={{ color: "var(--ink-soft)" }}>Цель</div>
              <div className="fp-display text-xl font-bold">{exercise.sets[0].reps}</div>
            </div>
            {cardioIsTimed && (
              <div className="fp-card p-3 mb-3 text-center" style={{ background: "var(--bg)" }}>
                <div className="fp-display text-2xl font-bold mb-2">{formatDuration(cardio.elapsedSec)}</div>
                <button type="button" className="fp-btn fp-btn-outline px-5 py-2 text-sm inline-flex items-center gap-2" onClick={() => setCardio((c) => ({ ...c, running: !c.running }))}>
                  {cardio.running ? <Pause size={14} /> : <Play size={14} />}
                  {cardio.running ? "Пауза" : "Старт"}
                </button>
              </div>
            )}
            <button type="button"
              className="fp-btn w-full py-2.5 flex items-center justify-center gap-2"
              style={exLog.done ? { background: "var(--accent-2)", color: "#fff" } : { background: "var(--bg)", color: "var(--ink)" }}
              onClick={toggleCardioDone}
            >
              <CheckCircle2 size={16} /> {exLog.done ? "Выполнено" : "Отметить выполненным"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {exLog.sets.map((s, idx) => {
              const activeIdx = exLog.sets.findIndex((x) => !x.done);
              const isActive = idx === (activeIdx === -1 ? exLog.sets.length - 1 : activeIdx);
              const isPast = s.done;

              if (isPast) {
                return (
                  <div key={idx} className="flex items-center gap-2 py-1" style={{ opacity: 0.55 }}>
                    <span className="text-xs w-4" style={{ color: "var(--ink-soft)" }}>{idx + 1}</span>
                    <span className="text-sm" style={{ color: "var(--ink-soft)", textDecoration: "line-through" }}>
                      {s.reps} × {s.weight || "—"} кг
                    </span>
                    <CheckCircle2 size={14} color="var(--accent-2)" style={{ marginLeft: "auto" }} />
                  </div>
                );
              }

              if (!isActive) {
                return (
                  <div key={idx} className="flex items-center gap-2 py-1" style={{ opacity: 0.4 }}>
                    <span className="text-xs w-4" style={{ color: "var(--ink-soft)" }}>{idx + 1}</span>
                    <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                      {exercise.sets[idx] ? `план ${exercise.sets[idx].reps}${exercise.sets[idx].weight ? `×${exercise.sets[idx].weight}` : ""}` : "доп. подход"}
                    </span>
                  </div>
                );
              }

              return (
                <div key={idx} className="fp-card flex items-center gap-2 p-2" style={{ borderColor: "var(--accent)", borderWidth: 1.5, background: "var(--bg)" }}>
                  <span className="text-xs w-4 font-bold" style={{ color: "var(--accent)" }}>{idx + 1}</span>
                  <input className="fp-input" style={{ width: 60, padding: "6px 8px" }} value={s.reps} onChange={(e) => updateSet(exercise.id, idx, { reps: e.target.value })} />
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>×</span>
                  <input className="fp-input" style={{ width: 68, padding: "6px 8px" }} value={s.weight} onChange={(e) => updateSet(exercise.id, idx, { weight: e.target.value })} placeholder="кг" />
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>кг</span>
                  <span className="text-xs ml-auto mr-1" style={{ color: "var(--ink-soft)" }}>
                    {exercise.sets[idx] ? `план ${exercise.sets[idx].reps}${exercise.sets[idx].weight ? `×${exercise.sets[idx].weight}` : ""}` : "доп. подход"}
                  </span>
                  <div className="fp-checkbox" style={{ borderRadius: 8, width: 34, height: 34 }} onClick={() => toggleSetDone(exercise.id, idx)}>
                    {s.done && <CheckCircle2 size={19} color="#fff" />}
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={addExtraSet} className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}>
              <Plus size={12} /> Добавить подход
            </button>
          </div>
        )}

            <div className="mt-3">
              <input
                className="fp-input"
                style={{ fontSize: 12, padding: "7px 10px" }}
                placeholder="Комментарий к упражнению (необязательно)"
                value={exerciseNotes[exercise.id] || ""}
                onChange={(e) => setExerciseNotes((prev) => ({ ...prev, [exercise.id]: e.target.value }))}
              />
            </div>

            <div className="mt-3">
              <ExerciseVideoBlock detail={exerciseDetail} loading={exerciseDetailLoading} title={exercise.name} />
            </div>
          </>
        )}

        {rest.active && !isCardio && (
          <div className="fp-card p-2.5 mt-3 flex items-center justify-between" style={{ background: "var(--bg)" }}>
            <span className="text-xs flex items-center gap-1.5"><Timer size={13} color="var(--accent)" /> Отдых: {formatDuration(rest.secondsLeft)}</span>
            <button type="button" className="text-xs" style={{ color: "var(--accent)" }} onClick={() => setRest({ active: false, secondsLeft: 0 })}>Пропустить</button>
          </div>
        )}

        {isLast && (
          <div className="mt-2">
            <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Как оцените тренировку?</label>
            <div className="flex gap-1.5 mb-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n} type="button" onClick={() => setRating(n)}
                  style={{ fontSize: 26, lineHeight: 1, color: n <= rating ? "var(--accent)" : "var(--line)" }}
                >★</button>
              ))}
            </div>
            <input
              className="fp-input"
              style={{ fontSize: 12, padding: "7px 10px" }}
              placeholder="Комментарий к тренировке в целом (необязательно)"
              value={sessionNote}
              onChange={(e) => setSessionNote(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button type="button" className="fp-btn fp-btn-outline flex-1 py-2.5 disabled:opacity-30" disabled={exIndex === 0} onClick={() => setExIndex((i) => Math.max(0, i - 1))}>← Назад</button>
        {isLast ? (
          <button type="button" className="fp-btn fp-btn-accent flex-1 py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50" disabled={finishing} onClick={finish}>
            <Flag size={14} /> {finishing ? "Сохраняем…" : "Завершить"}
          </button>
        ) : (
          <button type="button" className="fp-btn fp-btn-accent flex-1 py-2.5 disabled:opacity-40" disabled={isCircuitStep && !circuitRoundComplete} onClick={() => setExIndex((i) => Math.min(totalSteps - 1, i + 1))}>
            {isCircuitStep ? `Завершить круг → Круг ${currentStep.roundNumber + 1}` : "Далее →"}
          </button>
        )}
      </div>

      {!isLast && !isCircuitStep && (
        <button
          type="button"
          className="text-xs mt-2 flex items-center justify-center gap-1 w-full"
          style={{ color: "var(--ink-soft)" }}
          onClick={postponeExercise}
        >
          Тренажёр занят — перенести это упражнение на потом
        </button>
      )}

      {confirmExit && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(22,32,42,0.5)" }}>
          <div className="fp-card p-5 w-full max-w-xs text-center">
            <p className="text-sm mb-4">Прервать тренировку? Прогресс за эту сессию не сохранится.</p>
            <div className="flex gap-2">
              <button type="button" className="fp-btn fp-btn-outline flex-1 py-2 text-sm" onClick={() => setConfirmExit(false)}>Отмена</button>
              <button type="button" className="fp-btn flex-1 py-2 text-sm" style={{ background: "var(--danger)", color: "#fff" }} onClick={onExit}>Прервать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------- СВОБОДНАЯ (СВОЯ) ТРЕНИРОВКА ------------------------- */
// Клиент запускает сессию сразу — таймер идёт с этого момента, упражнения
// добавляются по ходу дела (не планируются заранее). Название обязательно
// вводится в самом конце, перед сохранением.

export function FreeformWorkoutSession({ onExit, onFinish }) {
  const [startedAt] = useState(() => Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);
  const [exercises, setExercises] = useState([]);
  const [showPicker, setShowPicker] = useState(true);
  const [title, setTitle] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const addExercise = (item) => {
    setExercises((prev) => [...prev, { ...item, sets: item.sets.map((s) => ({ ...s, done: false })) }]);
    setShowPicker(false);
  };
  const removeExercise = (exId) => setExercises((prev) => prev.filter((ex) => ex.id !== exId));
  const updateSet = (exId, idx, patch) => {
    setExercises((prev) => prev.map((ex) => (ex.id !== exId ? ex : { ...ex, sets: ex.sets.map((s, i) => (i === idx ? { ...s, ...patch } : s)) })));
  };
  const toggleSetDone = (exId, idx) => {
    setExercises((prev) => prev.map((ex) => (ex.id !== exId ? ex : { ...ex, sets: ex.sets.map((s, i) => (i === idx ? { ...s, done: !s.done } : s)) })));
  };
  const addSetTo = (exId) => {
    setExercises((prev) => prev.map((ex) => {
      if (ex.id !== exId) return ex;
      const last = ex.sets[ex.sets.length - 1] || { reps: "10", weight: "" };
      return { ...ex, sets: [...ex.sets, { reps: last.reps, weight: last.weight, done: false }] };
    }));
  };

  const canFinish = exercises.length > 0 && title.trim().length > 0;

  const finish = async () => {
    if (!canFinish) return;
    setFinishing(true);
    await onFinish({ title: title.trim(), startedAt, finishedAt: Date.now(), durationSec: elapsedSec, exercises });
  };

  return (
    <div className="min-h-screen fp-safe-top px-4 pb-6 max-w-lg mx-auto flex flex-col" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)" }}>
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={() => setConfirmExit(true)}><X size={20} color="var(--ink-soft)" /></button>
        <div className="fp-display font-semibold flex items-center gap-1.5"><Timer size={14} color="var(--accent)" /> {formatDuration(elapsedSec)}</div>
        <div style={{ width: 20 }} />
      </div>

      {exercises.map((ex) => (
        <div key={ex.id} className="fp-card p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">{ex.name}</div>
            <button type="button" onClick={() => removeExercise(ex.id)}><Trash2 size={14} color="var(--danger)" /></button>
          </div>
          <div className="space-y-2">
            {ex.sets.map((s, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs w-4" style={{ color: "var(--ink-soft)" }}>{idx + 1}</span>
                <input className="fp-input" style={{ width: 60, padding: "6px 8px" }} value={s.reps} onChange={(e) => updateSet(ex.id, idx, { reps: e.target.value })} />
                <span className="text-xs" style={{ color: "var(--ink-soft)" }}>×</span>
                <input className="fp-input" style={{ width: 68, padding: "6px 8px" }} value={s.weight} onChange={(e) => updateSet(ex.id, idx, { weight: e.target.value })} placeholder="кг" />
                <span className="text-xs" style={{ color: "var(--ink-soft)" }}>кг</span>
                <div className="fp-checkbox" style={{ marginLeft: "auto", borderRadius: 8, width: 32, height: 32 }} onClick={() => toggleSetDone(ex.id, idx)}>
                  {s.done && <CheckCircle2 size={18} color="#fff" />}
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addSetTo(ex.id)} className="text-xs mt-2 flex items-center gap-1" style={{ color: "var(--accent)" }}>
            <Plus size={12} /> Подход
          </button>
        </div>
      ))}

      {showPicker ? (
        <ExercisePicker onAdd={addExercise} />
      ) : (
        <button type="button" className="fp-btn fp-btn-outline w-full py-2.5 mb-4 flex items-center justify-center gap-2" onClick={() => setShowPicker(true)}>
          <Plus size={14} /> Добавить упражнение
        </button>
      )}

      {exercises.length > 0 && (
        <div className="mt-2">
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Название тренировки *</label>
          <input className="fp-input mb-3" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Обязательно перед сохранением" />
          <button type="button" className="fp-btn fp-btn-accent w-full py-2.5 disabled:opacity-40" disabled={!canFinish || finishing} onClick={finish}>
            {finishing ? "Сохраняем…" : "Завершить тренировку"}
          </button>
        </div>
      )}

      {confirmExit && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", zIndex: 60 }}>
          <div className="fp-card p-5 max-w-xs">
            <p className="text-sm mb-4">Выйти без сохранения? Прогресс потеряется.</p>
            <div className="flex gap-2">
              <button type="button" className="fp-btn fp-btn-outline flex-1" onClick={() => setConfirmExit(false)}>Остаться</button>
              <button type="button" className="fp-btn fp-btn-accent flex-1" onClick={onExit}>Выйти</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
