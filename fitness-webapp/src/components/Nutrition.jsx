import React, { useState, useEffect } from "react";
import { Utensils, X, Plus, Search, CheckCircle2, Circle, ClipboardList, ChevronLeft, ChevronRight, Calendar, Zap, Minus } from "lucide-react";
import { searchFoods, getFoodDetails } from "../lib/food";
import {
  fetchNutritionForDate, addNutritionEntry, removeNutritionEntry,
  fetchMealPlan, addMealPlanItem, removeMealPlanItem, updateClientProfile,
} from "../lib/api";
import { NutritionCalculator } from "./NutritionCalculator";

function CollapsibleCalculator({ client, onProfileSaved, onGoalsApplied }) {
  const [open, setOpen] = useState(false);
  const goals = client.goals;
  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="fp-card w-full p-3 flex items-center justify-between text-left"
      >
        <span className="text-sm font-medium">
          Счётчик КБЖУ {goals ? `— норма ${goals.kcal} ккал` : "— норма не задана"}
        </span>
        <span className="text-xs" style={{ color: "var(--accent)" }}>{open ? "Свернуть ▲" : "Открыть и поправить ▼"}</span>
      </button>
      {open && (
        <div className="mt-2">
          <NutritionCalculator client={client} onProfileSaved={onProfileSaved} onGoalsApplied={onGoalsApplied} />
        </div>
      )}
    </div>
  );
}

function generateMeals(count) {
  return Array.from({ length: Math.max(1, count) }, (_, i) => ({ id: `meal_${i + 1}`, label: `Приём ${i + 1}` }));
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayStr() {
  return toDateStr(new Date());
}

// Сдвиг даты на N дней — работает со строкой в локальном времени от начала
// до конца, не проходя через toISOString() (который переводит в UTC и в
// часовых поясах восточнее Гринвича может "съедать" день при обратной
// конвертации — из-за этого календарь и перескакивал/не пускал вперёд).
function shiftDateStr(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toDateStr(dt);
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

/* ------------------------------ КАЛЕНДАРЬ ДНЯ ------------------------------ */

function DateNav({ date, onChange }) {
  const [y, m, d] = date.split("-").map(Number);
  const localDate = new Date(y, m - 1, d);
  const isToday = date === todayStr();
  const label = localDate.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
  const shift = (delta) => onChange(shiftDateStr(date, delta));
  return (
    <div className="flex items-center justify-between mb-4">
      <button onClick={() => shift(-1)} className="fp-btn fp-btn-outline p-2"><ChevronLeft size={16} /></button>
      <label className="flex items-center gap-1.5 text-sm font-semibold capitalize" style={{ cursor: "pointer", position: "relative" }}>
        <Calendar size={14} color="var(--ink-soft)" />
        {isToday ? "Сегодня" : label}
        <input
          type="date" value={date} max={todayStr()}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
        />
      </label>
      <button onClick={() => shift(1)} disabled={isToday} className="fp-btn fp-btn-outline p-2 disabled:opacity-30"><ChevronRight size={16} /></button>
    </div>
  );
}

/* ------------------------------ ДОБАВЛЕНИЕ ЕДЫ ------------------------------ */

function findBase100(servings) {
  return servings.find((s) => /100\s?г|100\s?g/i.test(s.label));
}

function LogFoodForm({ meal, onAdd, onCancel, submitLabel = "Добавить" }) {
  const [mode, setMode] = useState("search"); // 'search' | 'quick'
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [servingId, setServingId] = useState("");
  const [qty, setQty] = useState(1);
  const [gramsMode, setGramsMode] = useState(false);
  const [grams, setGrams] = useState(100);
  const [quickName, setQuickName] = useState("");
  const [quickKcal, setQuickKcal] = useState("");

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
    setGrams(100);
    setGramsMode(false);
    setLoadingDetails(false);
  };

  const clearSelection = () => { setSelectedFood(null); setQuery(""); setResults([]); };

  const serving = selectedFood?.servings.find((s) => s.id === servingId);
  const base100 = selectedFood ? findBase100(selectedFood.servings) : null;

  const submit = () => {
    if (!selectedFood) return;
    if (gramsMode && base100) {
      const factor = (Number(grams) || 0) / 100;
      onAdd({
        foodId: selectedFood.id, name: selectedFood.name, servingLabel: `${grams} г`, meal,
        qty: 1, kcal: base100.kcal * factor, protein: base100.protein * factor,
        carbs: base100.carbs * factor, fat: base100.fat * factor,
      });
      clearSelection();
      return;
    }
    if (!serving) return;
    const factor = Number(qty) || 0;
    onAdd({
      foodId: selectedFood.id, name: selectedFood.name, servingLabel: serving.label, meal,
      qty: factor, kcal: serving.kcal * factor, protein: serving.protein * factor,
      carbs: serving.carbs * factor, fat: serving.fat * factor,
    });
    clearSelection();
  };

  const submitQuick = () => {
    if (!quickName.trim() || !quickKcal) return;
    onAdd({
      foodId: null, name: quickName.trim(), servingLabel: "быстрый ввод", meal,
      qty: 1, kcal: Number(quickKcal) || 0, protein: 0, carbs: 0, fat: 0,
    });
    setQuickName(""); setQuickKcal("");
  };

  return (
    <div className="fp-card p-4 mb-3" style={{ background: "var(--bg)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>ДОБАВИТЬ ПРОДУКТ</span>
        <button onClick={onCancel}><X size={15} color="var(--ink-soft)" /></button>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          className="fp-card px-2.5 py-1.5 text-xs flex-1"
          style={{ borderColor: mode === "search" ? "var(--accent)" : "var(--line)", borderWidth: mode === "search" ? 1.5 : 1 }}
          onClick={() => setMode("search")}
        >Поиск в базе</button>
        <button
          className="fp-card px-2.5 py-1.5 text-xs flex-1 flex items-center justify-center gap-1"
          style={{ borderColor: mode === "quick" ? "var(--accent)" : "var(--line)", borderWidth: mode === "quick" ? 1.5 : 1 }}
          onClick={() => setMode("quick")}
        ><Zap size={12} /> Быстрый ввод ккал</button>
      </div>

      {mode === "quick" ? (
        <div>
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Что съели</label>
          <input className="fp-input mb-2" value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="Например: обед в кафе" />
          <div className="flex items-center gap-2">
            <input className="fp-input" style={{ width: 100 }} type="number" value={quickKcal} onChange={(e) => setQuickKcal(e.target.value)} placeholder="ккал" />
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>ккал (без БЖУ)</span>
            <button className="fp-btn fp-btn-accent px-4 py-2 text-xs ml-auto disabled:opacity-40" disabled={!quickName.trim() || !quickKcal} onClick={submitQuick}>{submitLabel}</button>
          </div>
        </div>
      ) : !selectedFood ? (
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
              {base100 && (
                <div className="flex gap-2 mb-3">
                  <button
                    className="fp-card px-2.5 py-1.5 text-xs flex-1"
                    style={{ borderColor: !gramsMode ? "var(--accent)" : "var(--line)", borderWidth: !gramsMode ? 1.5 : 1 }}
                    onClick={() => setGramsMode(false)}
                  >Порция</button>
                  <button
                    className="fp-card px-2.5 py-1.5 text-xs flex-1"
                    style={{ borderColor: gramsMode ? "var(--accent)" : "var(--line)", borderWidth: gramsMode ? 1.5 : 1 }}
                    onClick={() => setGramsMode(true)}
                  >Свои граммы</button>
                </div>
              )}

              {gramsMode && base100 ? (
                <div className="flex items-center gap-2">
                  <label className="text-xs" style={{ color: "var(--ink-soft)" }}>Сколько грамм</label>
                  <input className="fp-input" style={{ width: 90 }} type="number" min="1" value={grams} onChange={(e) => setGrams(e.target.value)} />
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    ≈ {Math.round((base100.kcal * (Number(grams) || 0)) / 100)} ккал
                  </span>
                  <button className="fp-btn fp-btn-accent px-4 py-2 text-xs ml-auto" onClick={submit}>{submitLabel}</button>
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
                    <button className="fp-btn fp-btn-accent px-4 py-2 text-xs ml-auto disabled:opacity-40" disabled={!serving} onClick={submit}>{submitLabel}</button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ ШАГ ПРИЁМОВ ПИЩИ ------------------------------ */

function MealCountStepper({ mealCount, onChange }) {
  return (
    <div className="flex items-center justify-between mb-4 fp-card p-3" style={{ background: "var(--bg)" }}>
      <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Приёмов пищи в день</span>
      <div className="flex items-center gap-3">
        <button className="fp-btn fp-btn-outline p-1.5 disabled:opacity-30" disabled={mealCount <= 1} onClick={() => onChange(mealCount - 1)}><Minus size={13} /></button>
        <span className="font-semibold text-sm w-4 text-center">{mealCount}</span>
        <button className="fp-btn fp-btn-outline p-1.5 disabled:opacity-30" disabled={mealCount >= 8} onClick={() => onChange(mealCount + 1)}><Plus size={13} /></button>
      </div>
    </div>
  );
}

/* ------------------------------ ОБЩИЙ ДНЕВНИК (клиент + тренер) ------------------------------ */

function NutritionDiary({ client, canEditMealCount, onClientUpdated }) {
  const [date, setDate] = useState(todayStr());
  const [entries, setEntries] = useState([]);
  const [plan, setPlan] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingMeal, setAddingMeal] = useState(null);
  const [mealCount, setMealCount] = useState(client.meal_count || 4);

  const meals = generateMeals(mealCount);

  const load = () => {
    setLoading(true);
    Promise.all([fetchNutritionForDate(client.id, date), fetchMealPlan(client.id)]).then(([e, p]) => {
      setEntries(e); setPlan(p); setLoading(false);
    });
  };
  useEffect(() => { load(); }, [client.id, date]);

  const handleAdd = async (entry) => {
    await addNutritionEntry(client.id, date, entry);
    setAddingMeal(null);
    load();
  };
  const handleRemove = async (entryId) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    await removeNutritionEntry(entryId);
  };
  const handleCheckPlanItem = async (planItem) => {
    await addNutritionEntry(client.id, date, {
      foodId: null, name: planItem.name, servingLabel: planItem.serving_label, meal: planItem.meal,
      qty: planItem.qty, kcal: planItem.kcal, protein: planItem.protein, carbs: planItem.carbs, fat: planItem.fat,
    });
    load();
  };
  const handleMealCountChange = async (n) => {
    setMealCount(n);
    const updated = await updateClientProfile(client.id, { meal_count: n });
    onClientUpdated?.(updated);
  };

  const totals = macroTotals(entries);
  const goals = client.goals || { kcal: 2000, protein: 120, carbs: 220, fat: 60 };

  if (loading && entries.length === 0) return <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>;

  return (
    <div>
      <DateNav date={date} onChange={setDate} />

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

      {canEditMealCount && <MealCountStepper mealCount={mealCount} onChange={handleMealCountChange} />}

      {meals.map((meal) => {
        const items = entries.filter((e) => (e.meal || "meal_1") === meal.id);
        const planItems = plan.filter((p) => p.meal === meal.id);
        const loggedNames = new Set(items.map((e) => e.name));
        const planNames = new Set(planItems.map((p) => p.name));
        const subtotal = macroTotals(items).kcal;
        return (
          <div key={meal.id} className="fp-card p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><Utensils size={15} color="var(--ink-soft)" /><span className="font-semibold text-sm">{meal.label}</span></div>
              {items.length > 0 && <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{Math.round(subtotal)} ккал</span>}
            </div>

            {planItems.length > 0 && (
              <div className="mb-3">
                <div className="text-xs mb-1.5" style={{ color: "var(--ink-soft)" }}>ПО ПЛАНУ ОТ ТРЕНЕРА</div>
                <ul className="text-sm space-y-1.5">
                  {planItems.map((p) => {
                    const done = loggedNames.has(p.name);
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span style={{ color: done ? "var(--ink-soft)" : "var(--ink)", textDecoration: done ? "line-through" : "none" }}>
                          {p.name} <span style={{ color: "var(--ink-soft)" }}>· {p.qty} × {p.serving_label || "порция"}</span>
                        </span>
                        <button onClick={() => !done && handleCheckPlanItem(p)} className="flex-shrink-0">
                          {done ? <CheckCircle2 size={18} color="var(--accent-2)" /> : <Circle size={18} color="var(--line)" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {items.length > 0 && (
              <ul className="text-sm space-y-1.5 mb-2">
                {items.map((e) => {
                  const offPlan = !planNames.has(e.name);
                  return (
                    <li
                      key={e.id}
                      className="flex justify-between items-center gap-2"
                      style={offPlan ? { background: "rgba(255,106,61,0.1)", borderRadius: 8, padding: "4px 8px", margin: "0 -8px" } : undefined}
                    >
                      <span>
                        {e.name} <span style={{ color: "var(--ink-soft)" }}>· {e.qty} × {e.serving_label || "порция"}</span>
                        {offPlan && <span className="text-[10px] ml-1.5" style={{ color: "var(--accent)" }}>не по плану</span>}
                      </span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <span style={{ color: "var(--ink-soft)" }}>{Math.round(e.kcal)} ккал</span>
                        <button onClick={() => handleRemove(e.id)}><X size={13} color="var(--ink-soft)" /></button>
                      </span>
                    </li>
                  );
                })}
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

/* ------------------------------ TRAINER SIDE ------------------------------ */

export function TrainerNutritionPanel({ client, onClientUpdated }) {
  const [tab, setTab] = useState("plan"); // 'plan' | 'diary'
  const [plan, setPlan] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingMeal, setAddingMeal] = useState(null);
  const mealCount = client.meal_count || 4;
  const meals = generateMeals(mealCount);

  const loadPlan = () => {
    setLoading(true);
    fetchMealPlan(client.id).then((p) => { setPlan(p); setLoading(false); });
  };

  useEffect(() => { loadPlan(); }, [client.id]);

  const handleAddPlanItem = async (item) => {
    await addMealPlanItem(client.id, item);
    setAddingMeal(null);
    loadPlan();
  };

  const handleRemovePlanItem = async (itemId) => {
    setPlan((prev) => prev.filter((p) => p.id !== itemId));
    await removeMealPlanItem(itemId);
  };

  return (
    <div>
      <div className="flex gap-4 mb-4" style={{ borderBottom: "1px solid var(--line)" }}>
        <button
          onClick={() => setTab("plan")}
          className="text-sm pb-2"
          style={{ fontWeight: 600, color: tab === "plan" ? "var(--ink)" : "var(--ink-soft)", borderBottom: tab === "plan" ? "2px solid var(--accent)" : "none" }}
        >Меню</button>
        <button
          onClick={() => setTab("diary")}
          className="text-sm pb-2"
          style={{ fontWeight: 600, color: tab === "diary" ? "var(--ink)" : "var(--ink-soft)", borderBottom: tab === "diary" ? "2px solid var(--accent)" : "none" }}
        >История</button>
      </div>

      {tab === "diary" ? (
        <NutritionDiary client={client} canEditMealCount onClientUpdated={onClientUpdated} />
      ) : (
        <>
          <CollapsibleCalculator client={client} onProfileSaved={onClientUpdated} onGoalsApplied={onClientUpdated} />

          <div className="flex items-center gap-1.5 mb-3">
            <ClipboardList size={15} color="var(--accent)" />
            <h3 className="fp-display font-semibold">Меню на каждый день</h3>
          </div>
          <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            Пропишите конкретные продукты по приёмам пищи с граммовками и КБЖУ — клиент увидит их
            в своём дневнике и отметит галочкой «съедено» напротив каждого. Норму КБЖУ выше
            считает калькулятор сам, корректировки — вручную, раскрыв его.
            Вкладка «История» — календарь того, что клиент реально ел по дням, с возможностью поправить.
          </p>

          {loading ? (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>
          ) : (
            meals.map((meal) => {
              const items = plan.filter((p) => p.meal === meal.id);
              return (
                <div key={meal.id} className="fp-card p-4 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Utensils size={15} color="var(--ink-soft)" />
                    <span className="font-semibold text-sm">{meal.label}</span>
                  </div>
                  {items.length > 0 && (
                    <ul className="text-sm space-y-1.5 mb-2">
                      {items.map((it) => (
                        <li key={it.id} className="flex justify-between items-center gap-2">
                          <span>{it.name} <span style={{ color: "var(--ink-soft)" }}>· {it.qty} × {it.serving_label || "порция"}</span></span>
                          <span className="flex items-center gap-2 flex-shrink-0">
                            <span style={{ color: "var(--ink-soft)" }}>{Math.round(it.kcal)} ккал</span>
                            <button onClick={() => handleRemovePlanItem(it.id)}><X size={13} color="var(--ink-soft)" /></button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {addingMeal === meal.id ? (
                    <LogFoodForm meal={meal.id} onAdd={handleAddPlanItem} onCancel={() => setAddingMeal(null)} submitLabel="Добавить в план" />
                  ) : (
                    <button className="text-xs flex items-center gap-1" style={{ color: "var(--accent)" }} onClick={() => setAddingMeal(meal.id)}>
                      <Plus size={12} /> Добавить в рацион
                    </button>
                  )}
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------- CLIENT SIDE ------------------------------- */

export function NutritionTab({ client, onClientUpdated }) {
  return (
    <div className="px-4">
      <NutritionDiary client={client} canEditMealCount onClientUpdated={onClientUpdated} />
    </div>
  );
}
