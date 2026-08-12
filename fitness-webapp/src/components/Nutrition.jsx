import React, { useState, useEffect } from "react";
import { Coffee, Sun, Moon, Apple, X, Plus, Search } from "lucide-react";
import { searchFoods, getFoodDetails } from "../lib/food";
import { fetchNutritionForDate, addNutritionEntry, removeNutritionEntry } from "../lib/api";

const MEALS = [
  { id: "breakfast", label: "Завтрак", icon: Coffee },
  { id: "lunch", label: "Обед", icon: Sun },
  { id: "dinner", label: "Ужин", icon: Moon },
  { id: "snack", label: "Перекус", icon: Apple },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function macroTotals(entries) {
  return (entries || []).reduce(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal, protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs, fat: acc.fat + e.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function Ring({ value, max, size = 140, strokeWidth = 12, color = "var(--accent)", trackColor = "var(--line)", children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const offset = circumference * (1 - pct);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

function LogFoodForm({ meal, onAdd, onCancel }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [servingId, setServingId] = useState("");
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (selectedFood || !query.trim()) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchFoods(query).then((r) => { if (!cancelled) { setResults(r); setSearching(false); } });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, selectedFood]);

  const pickFood = async (item) => {
    setSelectedFood({ id: item.id, name: item.name, servings: [] });
    setLoadingDetails(true);
    const full = await getFoodDetails(item.id);
    if (full && full.servings && full.servings.length > 0) {
      setSelectedFood(full);
      setServingId(full.servings[0].id);
    } else {
      setSelectedFood({ id: item.id, name: item.name, servings: [] });
      setServingId("");
    }
    setQty(1);
    setLoadingDetails(false);
  };

  const clearSelection = () => { setSelectedFood(null); setQuery(""); setResults([]); };
  const serving = selectedFood?.servings.find((s) => s.id === servingId);

  const submit = () => {
    if (!selectedFood || !serving) return;
    const factor = Number(qty) || 0;
    onAdd({
      foodId: selectedFood.id, name: selectedFood.name, servingLabel: serving.label, meal,
      qty: factor, kcal: serving.kcal * factor, protein: serving.protein * factor,
      carbs: serving.carbs * factor, fat: serving.fat * factor,
    });
    clearSelection();
  };

  return (
    <div className="fp-card p-4 mb-3" style={{ background: "var(--bg)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>ДОБАВИТЬ ПРОДУКТ</span>
        <button onClick={onCancel}><X size={15} color="var(--ink-soft)" /></button>
      </div>
      {!selectedFood ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <Search size={15} color="var(--ink-soft)" />
            <input className="fp-input" placeholder="Найти продукт…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {searching && <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Ищем…</p>}
          {!searching && results.length > 0 && (
            <div className="fp-card fp-scroll" style={{ maxHeight: 180, overflowY: "auto" }}>
              {results.map((f) => (
                <button key={f.id} onClick={() => pickFood(f)} className="w-full text-left px-3 py-2 text-sm border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">{selectedFood.name}</span>
            <button onClick={clearSelection}><X size={16} color="var(--ink-soft)" /></button>
          </div>
          {loadingDetails ? (
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Загружаем порции…</p>
          ) : selectedFood.servings.length === 0 ? (
            <div>
              <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>Нет данных о КБЖУ для этого продукта — попробуйте другой.</p>
              <button className="text-xs" style={{ color: "var(--accent)" }} onClick={clearSelection}>← Искать заново</button>
            </div>
          ) : (
            <>
              <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Порция</label>
              <select className="fp-input mb-3" value={servingId} onChange={(e) => setServingId(e.target.value)}>
                {selectedFood.servings.map((s) => (
                  <option key={s.id} value={s.id}>{s.label} · {Math.round(s.kcal)} ккал</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: "var(--ink-soft)" }}>Количество порций</label>
                <input className="fp-input" style={{ width: 80 }} type="number" min="0.5" step="0.5" value={qty} onChange={(e) => setQty(e.target.value)} />
                <button className="fp-btn fp-btn-accent px-4 py-2 text-xs ml-auto disabled:opacity-40" disabled={!serving} onClick={submit}>Добавить</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function NutritionTab({ client }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingMeal, setAddingMeal] = useState(null);
  const today = todayStr();

  const load = () => {
    setLoading(true);
    fetchNutritionForDate(client.id, today).then((e) => { setEntries(e); setLoading(false); });
  };

  useEffect(() => { load(); }, [client.id]);

  const handleAdd = async (entry) => {
    await addNutritionEntry(client.id, today, entry);
    setAddingMeal(null);
    load();
  };

  const handleRemove = async (entryId) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    await removeNutritionEntry(entryId);
  };

  const totals = macroTotals(entries);
  const goals = client.goals || { kcal: 2000, protein: 120, carbs: 220, fat: 60 };

  if (loading) return <p className="text-sm px-4" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>;

  return (
    <div className="px-4">
      <div className="fp-card p-5 mb-5 flex flex-col items-center">
        <Ring value={totals.kcal} max={goals.kcal} size={158} strokeWidth={14} color="var(--accent)">
          <div className="text-center">
            <div className="fp-display text-3xl font-bold">{Math.max(0, Math.round(goals.kcal - totals.kcal))}</div>
            <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {totals.kcal > goals.kcal ? "ккал сверх нормы" : "ккал осталось"}
            </div>
          </div>
        </Ring>
        <div className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>
          {Math.round(totals.kcal)} из {goals.kcal} ккал
        </div>
        <div className="flex gap-6 mt-5">
          {[
            { label: "Белки", value: totals.protein, target: goals.protein, color: "var(--accent-2)" },
            { label: "Углеводы", value: totals.carbs, target: goals.carbs, color: "#D9A441" },
            { label: "Жиры", value: totals.fat, target: goals.fat, color: "#5C7CFA" },
          ].map((m) => (
            <div key={m.label} className="flex flex-col items-center">
              <Ring value={m.value} max={m.target} size={64} strokeWidth={7} color={m.color}>
                <span className="text-xs font-semibold">{Math.round(m.value)}</span>
              </Ring>
              <div className="text-[11px] mt-1.5 text-center" style={{ color: "var(--ink-soft)" }}>
                {m.label}<br />{Math.round(m.value)} / {m.target} г
              </div>
            </div>
          ))}
        </div>
      </div>

      {MEALS.map((meal) => {
        const items = entries.filter((e) => (e.meal || "snack") === meal.id);
        const subtotal = macroTotals(items).kcal;
        const MealIcon = meal.icon;
        return (
          <div key={meal.id} className="fp-card p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><MealIcon size={15} color="var(--ink-soft)" /><span className="font-semibold text-sm">{meal.label}</span></div>
              {items.length > 0 && <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{Math.round(subtotal)} ккал</span>}
            </div>
            {items.length > 0 && (
              <ul className="text-sm space-y-1.5 mb-2">
                {items.map((e) => (
                  <li key={e.id} className="flex justify-between items-center gap-2">
                    <span>{e.name} <span style={{ color: "var(--ink-soft)" }}>· {e.qty} × {e.serving_label || "порция"}</span></span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span style={{ color: "var(--ink-soft)" }}>{Math.round(e.kcal)} ккал</span>
                      <button onClick={() => handleRemove(e.id)}><X size={13} color="var(--ink-soft)" /></button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {addingMeal === meal.id ? (
              <LogFoodForm meal={meal.id} onAdd={handleAdd} onCancel={() => setAddingMeal(null)} />
            ) : (
              <button className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }} onClick={() => setAddingMeal(meal.id)}>
                <Plus size={12} /> Добавить продукт
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
