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
    background: selected ? "var(--accent)" : "#fff",
    color: selected ? "#fff" : "var(--ink)",
  });
  return (
    <div className="flex flex-wrap gap-1.5">
      {allowNone && (
        <button onClick={() => onChange("")} className="fp-card px-2.5 py-1.5 text-xs" style={chipStyle(value === "")}>
          {noneLabel}
        </button>
      )}
      {options.map((opt) => (
        <button key={opt} onClick={() => onChange(opt)} className="fp-card px-2.5 py-1.5 text-xs" style={chipStyle(value === opt)}>
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
              <button onClick={() => removeSet(idx)} className="ml-auto"><X size={14} color="var(--danger)" /></button>
            )}
          </div>
        ))}
      </div>
      <button onClick={addSet} className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}>
        <Plus size={12} /> Добавить подход
      </button>
    </div>
  );
}

function ExercisePicker({ onAdd }) {
  const [groupIdx, setGroupIdx] = useState(0);
  const [exIdx, setExIdx] = useState(0);
  const [equipment, setEquipment] = useState("");
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

  const applyAssistedAutoDetect = (eq) => {
    setIsAssisted(eq === "Гравитрон" || eq === "Резинка");
  };

  const changeGroup = (idx) => {
    const g = EXERCISE_GROUPS[idx];
    setGroupIdx(idx); setExIdx(0);
    const eq = g.name === "Кардио" ? (g.exercises[0].equipment[0] || "") : "";
    setEquipment(eq);
    setVariant(""); resetCardioDefaults();
    applyAssistedAutoDetect(eq);
    setPeriodizationEnabled(true);
  };
  const changeExercise = (idx) => {
    setExIdx(idx);
    const eq = isCardio ? (group.exercises[idx].equipment[0] || "") : "";
    setEquipment(eq);
    setVariant(""); resetCardioDefaults();
    applyAssistedAutoDetect(eq);
    setPeriodizationEnabled(true);
  };
  const changeEquipment = (eq) => { setEquipment(eq); applyAssistedAutoDetect(eq); };

  const composedName = [group.name, exercise.name, equipment || null, variant || null].filter(Boolean).join(" - ");

  const submit = () => {
    if (isCardio) {
      let value = "—";
      if (equipment === "По времени") value = formatCardioTime(timeHours, timeMinutes);
      else if (equipment === "По дистанции") value = `${distanceValue} км`;
      else if (equipment === "По повторениям") value = `${repsValue} ${pluralizeRu(repsValue, ["повторение", "повторения", "повторений"])}`;
      onAdd({ id: uid(), name: composedName, sets: [{ reps: value, weight: "" }], isAssisted: false, periodizationEnabled: false });
      resetCardioDefaults();
    } else {
      onAdd({ id: uid(), name: composedName, sets, isAssisted, periodizationEnabled });
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
          <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>{isCardio ? "Как измеряем" : "Снаряд / вариант"}</label>
          <ChipSelect options={exercise.equipment} value={equipment} onChange={changeEquipment} allowNone={!isCardio} />
        </div>
      )}

      {!isCardio && exercise.variant.length > 0 && (
        <div className="mb-3">
          <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Сторона / хват</label>
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

      <button className="fp-btn fp-btn-accent w-full py-2 text-sm flex items-center justify-center gap-1.5" onClick={submit}>
        <Plus size={14} /> Добавить в тренировку
      </button>
    </div>
  );
}

export function AssignWorkoutForm({ onAssign, onCancel }) {
  const [title, setTitle] = useState("");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

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
        <button onClick={onCancel}><X size={18} color="var(--ink-soft)" /></button>
      </div>
      <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Название тренировки</label>
      <input className="fp-input mb-4" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Ноги + кор" />

      <ExercisePicker onAdd={addItem} />

      {items.length > 0 && (
        <div className="space-y-2 mb-4 fp-scroll" style={{ maxHeight: 260, overflowY: "auto" }}>
          {items.map((it, idx) => (
            <div key={it.id} className="flex items-center gap-2 fp-card px-3 py-2">
              <div className="flex flex-col">
                <button onClick={() => moveItem(it.id, -1)} disabled={idx === 0} className="disabled:opacity-25"><ArrowUp size={13} color="var(--ink-soft)" /></button>
                <button onClick={() => moveItem(it.id, 1)} disabled={idx === items.length - 1} className="disabled:opacity-25"><ArrowDown size={13} color="var(--ink-soft)" /></button>
              </div>
              <div className="text-sm flex-1">
                <div>{it.name}</div>
                <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{formatSets(it.sets)}</div>
              </div>
              <button onClick={() => removeItem(it.id)}><Trash2 size={16} color="var(--danger)" /></button>
            </div>
          ))}
        </div>
      )}

      <button className="fp-btn fp-btn-accent w-full py-2.5 disabled:opacity-40" disabled={!title.trim() || items.length === 0 || busy} onClick={submit}>
        {busy ? "Назначаем…" : `Назначить клиенту ${items.length > 0 ? `(${items.length})` : ""}`}
      </button>
    </div>
  );
}

/* ------------------------------ WORKOUT SESSION ------------------------------ */

export function WorkoutSession({ workout, onExit, onFinish }) {
  const [exIndex, setExIndex] = useState(0);
  const [log, setLog] = useState(() => {
    const initial = {};
    workout.workout_exercises.forEach((ex) => {
      initial[ex.id] = { sets: ex.sets.map((s) => ({ reps: s.reps, weight: s.weight, done: false })), done: false };
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

  const exercises = workout.workout_exercises;
  const exercise = exercises[exIndex];
  const isCardio = exercise.name.startsWith("Кардио");
  const exLog = log[exercise.id];
  const totalExercises = exercises.length;
  const doneCount = Object.values(log).filter((l) => l.done).length;
  const isLast = exIndex === totalExercises - 1;
  const { detail: exerciseDetail, loading: exerciseDetailLoading } = useExerciseDetail(exercise.name);

  const updateSet = (setIdx, patch) => {
    setLog((prev) => {
      const exState = prev[exercise.id];
      const nextSets = exState.sets.map((s, i) => (i === setIdx ? { ...s, ...patch } : s));
      return { ...prev, [exercise.id]: { sets: nextSets, done: nextSets.every((s) => s.done) } };
    });
  };
  const toggleSetDone = (setIdx) => {
    const wasDone = exLog.sets[setIdx].done;
    updateSet(setIdx, { done: !wasDone });
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
  const cardioIsTimed = isCardio && /мин|час/.test(exercise.sets[0].reps);

  const finish = async () => {
    setFinishing(true);
    const exercisesPayload = exercises.map((ex) => ({
      id: ex.id, name: ex.name, plannedSets: ex.sets, actualSets: log[ex.id].sets, done: log[ex.id].done,
      note: (exerciseNotes[ex.id] || "").trim() || null,
    }));
    await onFinish({
      workoutId: workout.id, title: workout.title, startedAt,
      finishedAt: Date.now(), durationSec: elapsedSec, exercises: exercisesPayload,
      note: sessionNote.trim() || null,
    });
  };

  return (
    <div className="min-h-screen fp-safe-top px-4 pb-6 max-w-lg mx-auto flex flex-col" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)" }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="fp-display text-lg font-semibold">{workout.title}</div>
          <div className="text-xs" style={{ color: "var(--ink-soft)" }}>Упражнение {exIndex + 1} из {totalExercises}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold flex items-center gap-1"><Timer size={14} color="var(--ink-soft)" /> {formatDuration(elapsedSec)}</span>
          <button onClick={() => setConfirmExit(true)}><X size={20} color="var(--ink-soft)" /></button>
        </div>
      </div>

      <div className="fp-bar-track mb-3"><div className="fp-bar-fill" style={{ width: `${(doneCount / totalExercises) * 100}%`, background: "var(--accent-2)" }} /></div>

      <div className="fp-card p-4 mb-3 flex-1">
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
                <button className="fp-btn fp-btn-outline px-5 py-2 text-sm inline-flex items-center gap-2" onClick={() => setCardio((c) => ({ ...c, running: !c.running }))}>
                  {cardio.running ? <Pause size={14} /> : <Play size={14} />}
                  {cardio.running ? "Пауза" : "Старт"}
                </button>
              </div>
            )}
            <button
              className="fp-btn w-full py-2.5 flex items-center justify-center gap-2"
              style={exLog.done ? { background: "var(--accent-2)", color: "#fff" } : { background: "var(--bg)", color: "var(--ink)" }}
              onClick={toggleCardioDone}
            >
              <CheckCircle2 size={16} /> {exLog.done ? "Выполнено" : "Отметить выполненным"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {exLog.sets.map((s, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs w-4" style={{ color: "var(--ink-soft)" }}>{idx + 1}</span>
                <input className="fp-input" style={{ width: 60, padding: "6px 8px" }} value={s.reps} onChange={(e) => updateSet(idx, { reps: e.target.value })} />
                <span className="text-xs" style={{ color: "var(--ink-soft)" }}>×</span>
                <input className="fp-input" style={{ width: 68, padding: "6px 8px" }} value={s.weight} onChange={(e) => updateSet(idx, { weight: e.target.value })} placeholder="кг" />
                <span className="text-xs" style={{ color: "var(--ink-soft)" }}>кг</span>
                <span className="text-xs ml-auto mr-1" style={{ color: "var(--ink-soft)" }}>
                  {exercise.sets[idx] ? `план ${exercise.sets[idx].reps}${exercise.sets[idx].weight ? `×${exercise.sets[idx].weight}` : ""}` : "доп. подход"}
                </span>
                <div className={`fp-checkbox ${s.done ? "done" : ""}`} style={{ borderRadius: 8, width: 24, height: 24 }} onClick={() => toggleSetDone(idx)}>
                  {s.done && <CheckCircle2 size={13} color="#fff" />}
                </div>
              </div>
            ))}
            <button onClick={addExtraSet} className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }}>
              <Plus size={12} /> Добавить подход
            </button>
          </div>
        )}

        {rest.active && !isCardio && (
          <div className="fp-card p-2.5 mt-3 flex items-center justify-between" style={{ background: "var(--bg)" }}>
            <span className="text-xs flex items-center gap-1.5"><Timer size={13} color="var(--accent)" /> Отдых: {formatDuration(rest.secondsLeft)}</span>
            <button className="text-xs" style={{ color: "var(--accent)" }} onClick={() => setRest({ active: false, secondsLeft: 0 })}>Пропустить</button>
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

        {isLast && (
          <div className="mt-2">
            <input
              className="fp-input"
              style={{ fontSize: 12, padding: "7px 10px" }}
              placeholder="Комментарий к тренировке в целом (необязательно)"
              value={sessionNote}
              onChange={(e) => setSessionNote(e.target.value)}
            />
          </div>
        )}

        <div className="mt-3">
          <ExerciseVideoBlock detail={exerciseDetail} loading={exerciseDetailLoading} title={exercise.name} />
        </div>
      </div>

      <div className="flex gap-2">
        <button className="fp-btn fp-btn-outline flex-1 py-2.5 disabled:opacity-30" disabled={exIndex === 0} onClick={() => setExIndex((i) => Math.max(0, i - 1))}>← Назад</button>
        {isLast ? (
          <button className="fp-btn fp-btn-accent flex-1 py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-50" disabled={finishing} onClick={finish}>
            <Flag size={14} /> {finishing ? "Сохраняем…" : "Завершить"}
          </button>
        ) : (
          <button className="fp-btn fp-btn-accent flex-1 py-2.5" onClick={() => setExIndex((i) => Math.min(totalExercises - 1, i + 1))}>Далее →</button>
        )}
      </div>

      {confirmExit && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(22,32,42,0.5)" }}>
          <div className="fp-card p-5 w-full max-w-xs text-center">
            <p className="text-sm mb-4">Прервать тренировку? Прогресс за эту сессию не сохранится.</p>
            <div className="flex gap-2">
              <button className="fp-btn fp-btn-outline flex-1 py-2 text-sm" onClick={() => setConfirmExit(false)}>Отмена</button>
              <button className="fp-btn flex-1 py-2 text-sm" style={{ background: "var(--danger)", color: "#fff" }} onClick={onExit}>Прервать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
