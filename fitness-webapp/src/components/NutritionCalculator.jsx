import React, { useState, useEffect } from "react";
import { Calculator, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { updateClientProfile, setClientGoals, fetchWeeklySessionRate, fetchCheckins } from "../lib/api";

const ACTIVITY_LEVELS = [
  { max: 1, mult: 1.2, label: "Почти нет тренировок" },
  { max: 3, mult: 1.375, label: "Лёгкая активность" },
  { max: 5, mult: 1.55, label: "Средняя активность" },
  { max: 7, mult: 1.725, label: "Высокая активность" },
  { max: Infinity, mult: 1.9, label: "Очень высокая активность" },
];

function activityFor(sessionsPerWeek) {
  return ACTIVITY_LEVELS.find((l) => sessionsPerWeek <= l.max) || ACTIVITY_LEVELS[ACTIVITY_LEVELS.length - 1];
}

function goalMultiplier(goal) {
  if (goal === "Похудение") return 0.8;
  if (goal === "Набор массы") return 1.12;
  return 1; // поддержание формы / восстановление / другое
}

function calcTargets({ gender, height, weight, age, sessionsPerWeek, goal }) {
  const h = Number(height) || 0;
  const w = Number(weight) || 0;
  const a = Number(age) || 0;
  const bmr = gender === "female" ? 10 * w + 6.25 * h - 5 * a - 161 : 10 * w + 6.25 * h - 5 * a + 5;
  const activity = activityFor(Number(sessionsPerWeek) || 0);
  const tdee = bmr * activity.mult;
  const target = tdee * goalMultiplier(goal);

  const protein = w * 2;
  const fat = w * 0.9;
  const proteinKcal = protein * 4;
  const fatKcal = fat * 9;
  const carbsKcal = Math.max(0, target - proteinKcal - fatKcal);
  const carbs = carbsKcal / 4;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    activityLabel: activity.label,
    kcal: Math.round(target),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
  };
}

export function NutritionCalculator({ client, onProfileSaved, onGoalsApplied }) {
  // Пол — фиксированный, из анкеты, здесь не меняется.
  const gender = client.gender || null;
  // Рост и возраст — из анкеты, тренер может скорректировать при необходимости.
  const [height, setHeight] = useState(client.onboarding?.height || "");
  const [age, setAge] = useState(client.age || "");
  // Вес — подтягивается из последнего чек-ина (по факту), а не из анкеты при регистрации.
  const [weight, setWeight] = useState("");
  const [weightSource, setWeightSource] = useState(null); // 'checkin' | 'onboarding' | null
  const [sessionsPerWeek, setSessionsPerWeek] = useState(client.target_sessions_per_week || 3);
  const [busy, setBusy] = useState(false);
  const [actualRate, setActualRate] = useState(null);
  const [loadingWeight, setLoadingWeight] = useState(true);

  useEffect(() => {
    fetchWeeklySessionRate(client.id, 3).then(setActualRate).catch(() => setActualRate(null));
  }, [client.id]);

  useEffect(() => {
    setLoadingWeight(true);
    fetchCheckins(client.id)
      .then((checkins) => {
        if (checkins.length > 0 && checkins[0].weight) {
          setWeight(checkins[0].weight);
          setWeightSource("checkin");
        } else if (client.onboarding?.startWeight) {
          setWeight(client.onboarding.startWeight);
          setWeightSource("onboarding");
        }
      })
      .catch(() => {
        if (client.onboarding?.startWeight) {
          setWeight(client.onboarding.startWeight);
          setWeightSource("onboarding");
        }
      })
      .finally(() => setLoadingWeight(false));
  }, [client.id]);

  const goal = client.onboarding?.goal;
  const canCalc = gender && height && weight && age;
  const result = canCalc
    ? calcTargets({ gender, height, weight, age, sessionsPerWeek, goal })
    : null;

  const saveProfile = async () => {
    setBusy(true);
    await updateClientProfile(client.id, {
      age: Number(age) || null,
      target_sessions_per_week: Number(sessionsPerWeek) || null,
    });
    onProfileSaved?.();
    setBusy(false);
  };

  const applyGoals = async () => {
    if (!result) return;
    setBusy(true);
    const updated = await setClientGoals(client.id, {
      kcal: result.kcal, protein: result.protein, carbs: result.carbs, fat: result.fat,
    });
    onGoalsApplied?.(updated);
    setBusy(false);
  };

  const target = Number(client.target_sessions_per_week) || Number(sessionsPerWeek) || 0;
  let recommendation = null;
  if (actualRate !== null && target > 0) {
    const diff = actualRate - target;
    if (diff >= 1) {
      recommendation = { type: "up", text: `Клиент тренируется чаще плана (${actualRate.toFixed(1)} раз/нед против ${target}) — можно немного увеличить норму калорий.` };
    } else if (diff <= -1) {
      recommendation = { type: "down", text: `Клиент тренируется реже плана (${actualRate.toFixed(1)} раз/нед против ${target}) — стоит немного снизить норму калорий или уточнить причину пропусков.` };
    } else {
      recommendation = { type: "ok", text: `Частота тренировок соответствует плану (${actualRate.toFixed(1)} раз/нед) — норму менять не обязательно.` };
    }
  }

  return (
    <div className="fp-card p-4 mb-5">
      <div className="flex items-center gap-1.5 mb-4">
        <Calculator size={15} color="var(--accent)" />
        <h3 className="fp-display font-semibold">Калькулятор КБЖУ</h3>
      </div>

      <div className="mb-3">
        <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Пол (из анкеты клиента)</label>
        <div className="fp-card px-3 py-2 text-sm" style={{ background: "var(--bg)" }}>
          {gender === "male" ? "Мужчина" : gender === "female" ? "Женщина" : "Не указан — попросите клиента заполнить анкету"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Рост, см</label>
          <input className="fp-input" type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>
            Вес, кг {weightSource === "checkin" && <span style={{ color: "var(--accent-2)" }}>(из чек-ина)</span>}
          </label>
          <input className="fp-input" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={loadingWeight ? "…" : ""} />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Возраст</label>
          <input className="fp-input" type="number" value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Тренировок в неделю</label>
          <input className="fp-input" type="number" min="0" value={sessionsPerWeek} onChange={(e) => setSessionsPerWeek(e.target.value)} />
        </div>
      </div>

      <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
        Цель по анкете клиента: <b>{goal || "не указана"}</b>. Вес и активность обновляются по факту (чек-ины, тренировки) — при необходимости тренер может скорректировать любое поле вручную, это имеет приоритет.
      </p>

      {result ? (
        <div className="fp-card p-3 mb-4" style={{ background: "var(--bg)" }}>
          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
            <div>BMR (базовый обмен): <b>{result.bmr}</b> ккал</div>
            <div>Расход с активностью: <b>{result.tdee}</b> ккал</div>
          </div>
          <div className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>{result.activityLabel}</div>
          <div className="fp-display text-xl font-bold mb-2">{result.kcal} ккал / день</div>
          <div className="flex gap-4 text-xs">
            <span>Белки: <b>{result.protein} г</b></span>
            <span>Углеводы: <b>{result.carbs} г</b></span>
            <span>Жиры: <b>{result.fat} г</b></span>
          </div>
        </div>
      ) : (
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          {gender ? "Заполните рост, вес и возраст, чтобы увидеть расчёт." : "У клиента не указан пол в анкете — расчёт станет доступен после её заполнения."}
        </p>
      )}

      {recommendation && (
        <div
          className="fp-card p-3 mb-4 flex items-start gap-2"
          style={{ background: "var(--bg)" }}
        >
          {recommendation.type === "up" && <TrendingUp size={15} color="var(--accent-2)" style={{ marginTop: 2, flexShrink: 0 }} />}
          {recommendation.type === "down" && <TrendingDown size={15} color="var(--danger)" style={{ marginTop: 2, flexShrink: 0 }} />}
          {recommendation.type === "ok" && <Minus size={15} color="var(--ink-soft)" style={{ marginTop: 2, flexShrink: 0 }} />}
          <span className="text-xs">{recommendation.text}</span>
        </div>
      )}

      <div className="flex gap-2">
        <button className="fp-btn fp-btn-outline flex-1 py-2 text-xs disabled:opacity-40" disabled={busy} onClick={saveProfile}>
          Сохранить профиль
        </button>
        <button className="fp-btn fp-btn-accent flex-1 py-2 text-xs disabled:opacity-40" disabled={busy || !result} onClick={applyGoals}>
          Применить как цель
        </button>
      </div>
    </div>
  );
}
