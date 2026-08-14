import React, { useState, useEffect } from "react";
import {
  Dumbbell, Apple, TrendingUp, User, CheckCircle2, LogOut, ChevronLeft,
  Users, Sparkles, MessageCircle, LayoutGrid, Bell, Copy, Layers, Trophy, CalendarDays, X,
} from "lucide-react";
import "./App.css";
import { AssignWorkoutForm, WorkoutSession, formatSets } from "./components/Workouts";
import { NutritionTab, TrainerNutritionPanel } from "./components/Nutrition";
import { ChatPanel, TrainerInbox } from "./components/Chat";
import { ProgressTab, TrainerProgressPanel } from "./components/Progress";
import { TemplateManager, AssignFromTemplate, PeriodizationPanel } from "./components/Templates";
import { ExerciseProgressSection, TrainerLeaderboard } from "./components/ExerciseProgress";
import { MicrocycleManager, AssignMicrocycle } from "./components/Microcycles";
import { enablePushNotifications, pushSupported, PUSH_ERROR_MESSAGES } from "./lib/push";
import {
  getSession, onAuthChange, signUp, signIn, signOut,
  fetchTrainers, fetchTrainerByAuthId, fetchClientsForTrainer,
  fetchClientByAuthId, createClientProfile, activateSubscription, completeOnboarding, updateClientProfile,
  fetchWorkoutsForClient, createWorkout, toggleExerciseDone, saveWorkoutSession,
} from "./lib/api";

const PLANS = [
  {
    id: "basic", name: "Дневник", price: 990, priceLabel: "990 ₽ / мес",
    features: ["Дневник питания с подсчётом КБЖУ", "Журнал тренировок", "Без персонального тренера"],
    trainerIds: [],
  },
  {
    id: "plan", name: "Индивидуальный план", price: 2990, priceLabel: "2 990 ₽ / мес",
    features: ["Тренировочный план на месяц", "План питания на месяц", "Дневник питания и тренировок"],
    trainerIds: ["t1", "t2"],
  },
  {
    id: "vip", name: "VIP-ведение", priceMonthly: 19900, price3m: 49900,
    features: ["Личный чат поддержки с тренерами", "Отслеживание прогресса", "Корректировки плана в течение месяца"],
    trainerIds: ["t1", "t2"],
  },
];

function planPrice(planId, billing) {
  const plan = PLANS.find((p) => p.id === planId);
  if (plan.id === "vip") return billing === "quarterly" ? plan.price3m : plan.priceMonthly;
  return plan.price;
}
function planPriceLabel(planId, billing) {
  const plan = PLANS.find((p) => p.id === planId);
  if (plan.id === "vip") return billing === "quarterly" ? "49 900 ₽ / 3 мес" : "19 900 ₽ / мес";
  return plan.priceLabel;
}

const GOAL_OPTIONS = ["Похудение", "Набор массы", "Поддержание формы", "Восстановление после травмы", "Другое"];
const EXPERIENCE_OPTIONS = ["Новичок", "Средний", "Продвинутый"];
const DIET_OPTIONS = ["Без ограничений", "Вегетарианство", "Веганство", "Без глютена", "Без лактозы", "Халяль", "Кошер"];
const OCCUPATION_OPTIONS = ["Сидячая работа", "Активная работа", "Смешанная / на ногах"];
const EQUIPMENT_OPTIONS = ["Зал", "Дома", "На улице", "Зал + дома"];
const DAY_OPTIONS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/* -------------------------------- SHARED UI -------------------------------- */

function Chip({ children, style }) {
  return <span className="fp-chip" style={style}>{children}</span>;
}

function PageHeader({ eyebrow, title, subtitle, onLogout }) {
  return (
    <div className="fp-fixed-header px-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Chip style={{ background: "var(--ink)", color: "#fff", flexShrink: 0 }}>{eyebrow}</Chip>
            <h1 className="fp-display text-base font-bold truncate">{title}</h1>
          </div>
          {subtitle && <p className="text-xs mt-0.5 truncate" style={{ color: "var(--ink-soft)" }}>{subtitle}</p>}
        </div>
        {onLogout && (
          <button onClick={onLogout} className="fp-btn fp-btn-outline px-3 py-2 flex items-center gap-1.5 text-xs flex-shrink-0">
            <LogOut size={14} /> Выйти
          </button>
        )}
      </div>
    </div>
  );
}

function ComingSoonCard({ icon: Icon, title, text }) {
  return (
    <div className="fp-card p-6 text-center mx-4" style={{ background: "var(--bg)" }}>
      <div className="w-11 h-11 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: "var(--ink)" }}>
        <Icon size={18} color="#fff" />
      </div>
      <div className="fp-display font-semibold mb-1">{title}</div>
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{text}</p>
    </div>
  );
}

function BottomNav({ items, active, onChange }) {
  return (
    <nav className="fp-bottom-nav">
      {items.map((it) =>
        it.primary ? (
          <button
            key={it.key}
            className={`fp-bottom-nav-primary ${active === it.key ? "active" : ""}`}
            onClick={() => onChange(it.key)}
          >
            <span className="fp-bottom-nav-primary-circle"><it.icon size={26} /></span>
          </button>
        ) : (
          <button
            key={it.key}
            className={`fp-bottom-nav-item ${active === it.key ? "active" : ""}`}
            onClick={() => onChange(it.key)}
          >
            <it.icon size={20} />
            <span className="label">{it.label}</span>
          </button>
        )
      )}
    </nav>
  );
}

/* -------------------------------- SCREENS -------------------------------- */

function LoginScreen({ trainers, onPickTrainerLogin, onPickClientEntry }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center mb-10 max-w-xl">
        <Chip style={{ background: "var(--accent)", color: "#fff", marginBottom: 16 }}>
          <Dumbbell size={13} /> ОНЛАЙН-ТРЕНИРОВКИ
        </Chip>
        <h1 className="fp-display text-4xl md:text-5xl font-bold mb-3">Форма. Питание. Прогресс.</h1>
        <p style={{ color: "var(--ink-soft)" }}>
          Персональные тренировки, дневник питания и отслеживание прогресса — в одном месте.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 w-full max-w-4xl">
        {trainers.map((t) => (
          <button key={t.id} onClick={onPickTrainerLogin} className="fp-card p-6 text-left hover:shadow-md transition-shadow">
            <div className="w-11 h-11 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--ink)" }}>
              <User size={20} color="#fff" />
            </div>
            <Chip style={{ background: "var(--bg)", color: "var(--ink-soft)", marginBottom: 8 }}>ТРЕНЕР</Chip>
            <div className="fp-display text-xl font-semibold mb-1">{t.name}</div>
            <div className="text-sm mb-2" style={{ color: "var(--accent)" }}>{t.spec}</div>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{t.bio}</p>
          </button>
        ))}

        <button
          onClick={onPickClientEntry}
          className="fp-card p-6 text-left hover:shadow-md transition-shadow"
          style={{ borderColor: "var(--accent)", borderWidth: 1.5 }}
        >
          <div className="w-11 h-11 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--accent)" }}>
            <Sparkles size={20} color="#fff" />
          </div>
          <Chip style={{ background: "var(--bg)", color: "var(--ink-soft)", marginBottom: 8 }}>КЛИЕНТ</Chip>
          <div className="fp-display text-xl font-semibold mb-1">Зарегистрироваться</div>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Выберите тариф, оформите подписку и получите доступ к заданиям, дневнику питания и прогрессу.
          </p>
        </button>
      </div>
    </div>
  );
}

function TrainerLoginScreen({ onBack, onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      await signIn(email, password);
      onLoggedIn();
    } catch (e) {
      setError("Не получилось войти — проверьте email и пароль.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="fp-card p-7 w-full max-w-sm">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
          <ChevronLeft size={16} /> Назад
        </button>
        <h2 className="fp-display text-2xl font-semibold mb-5">Вход для тренера</h2>
        <input className="fp-input mb-3" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="fp-input mb-4" type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="fp-btn fp-btn-accent w-full py-2.5 disabled:opacity-50" disabled={busy} onClick={submit}>
          {busy ? "Входим…" : "Войти"}
        </button>
      </div>
    </div>
  );
}

function ClientEntryScreen({ onBack, onLoggedIn }) {
  const [mode, setMode] = useState("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [planId, setPlanId] = useState("plan");
  const [billing, setBilling] = useState("monthly");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const doLogin = async () => {
    setBusy(true); setError("");
    try { await signIn(email, password); onLoggedIn(); }
    catch (e) { setError("Не получилось войти — проверьте email и пароль."); }
    setBusy(false);
  };

  const doRegister = async () => {
    setBusy(true); setError("");
    try {
      const plan = PLANS.find((p) => p.id === planId);
      const { user, session } = await signUp(email, password);
      if (!session) {
        setError("Проверьте почту — нужно подтвердить email перед первым входом.");
        setBusy(false);
        return;
      }
      await createClientProfile({
        authUserId: user.id, name, plan: planId,
        billing: planId === "vip" ? billing : null,
        price: planPrice(planId, billing),
        trainerIds: plan.trainerIds,
      });
      onLoggedIn();
    } catch (e) {
      setError(e.message || "Не получилось зарегистрироваться.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="fp-card p-7 w-full max-w-lg">
        <button onClick={onBack} className="flex items-center gap-1 text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
          <ChevronLeft size={16} /> Назад
        </button>

        <div className="flex gap-2 mb-6">
          <button onClick={() => setMode("register")} className={`fp-tab ${mode === "register" ? "active" : ""}`}>Регистрация</button>
          <button onClick={() => setMode("login")} className={`fp-tab ${mode === "login" ? "active" : ""}`}>У меня уже есть аккаунт</button>
        </div>

        {mode === "login" ? (
          <div>
            <input className="fp-input mb-3" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="fp-input mb-4" type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</p>}
            <button className="fp-btn fp-btn-accent w-full py-2.5 disabled:opacity-50" disabled={busy} onClick={doLogin}>
              {busy ? "Входим…" : "Войти"}
            </button>
          </div>
        ) : (
          <div>
            <input className="fp-input mb-3" placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="fp-input mb-3" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="fp-input mb-4" type="password" placeholder="Пароль (мин. 6 символов)" value={password} onChange={(e) => setPassword(e.target.value)} />

            <label className="text-sm mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Выберите тариф</label>
            <div className="grid grid-cols-1 gap-2 mb-5">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlanId(p.id)}
                  className="fp-card p-4 text-left w-full"
                  style={{ borderColor: planId === p.id ? "var(--accent)" : "var(--line)", borderWidth: planId === p.id ? 1.5 : 1 }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-semibold">{p.name}</div>
                    {planId === p.id && <CheckCircle2 size={16} color="var(--accent)" />}
                  </div>
                  <div className="fp-display text-lg font-semibold mb-2">
                    {p.id === "vip" ? planPriceLabel("vip", billing) : p.priceLabel}
                  </div>
                  {p.id === "vip" && planId === "vip" && (
                    <div className="flex gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setBilling("monthly")}
                        className="fp-card px-2.5 py-1.5 text-xs flex-1"
                        style={{ borderColor: billing === "monthly" ? "var(--accent)" : "var(--line)", borderWidth: billing === "monthly" ? 1.5 : 1 }}
                      >Помесячно</button>
                      <button
                        onClick={() => setBilling("quarterly")}
                        className="fp-card px-2.5 py-1.5 text-xs flex-1"
                        style={{ borderColor: billing === "quarterly" ? "var(--accent)" : "var(--line)", borderWidth: billing === "quarterly" ? 1.5 : 1 }}
                      >На 3 мес</button>
                    </div>
                  )}
                  <ul className="text-xs space-y-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5" style={{ color: "var(--ink-soft)" }}>
                        <CheckCircle2 size={12} color="var(--accent-2)" style={{ marginTop: 2, flexShrink: 0 }} /> {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>

            {error && <p className="text-sm mb-3" style={{ color: "var(--danger)" }}>{error}</p>}
            <button
              className="fp-btn fp-btn-accent w-full py-2.5 disabled:opacity-50"
              disabled={busy || !name.trim() || !email.trim() || password.length < 6}
              onClick={doRegister}
            >
              {busy ? "Регистрируем…" : "Продолжить к оплате"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubscribeGate({ client, onPaid }) {
  const [busy, setBusy] = useState(false);
  const plan = PLANS.find((p) => p.id === client.plan);

  const pay = async () => {
    setBusy(true);
    const updated = await activateSubscription(client.id);
    onPaid(updated);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="fp-card p-7 w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-4" style={{ background: "var(--accent)" }}>
          <Sparkles size={20} color="#fff" />
        </div>
        <h2 className="fp-display text-2xl font-semibold mb-1">Тариф «{plan.name}»</h2>
        <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>{client.name}, оформите подписку, чтобы продолжить.</p>
        <div className="fp-card p-4 mb-5 text-left" style={{ background: "var(--bg)" }}>
          {plan.features.map((f) => (
            <div key={f} className="flex justify-between text-sm mb-1 last:mb-0"><span>{f}</span><span>✓</span></div>
          ))}
        </div>
        <div className="fp-display text-2xl font-bold mb-5">
          {client.plan === "vip" ? planPriceLabel("vip", client.billing) : plan.priceLabel}
        </div>
        <button className="fp-btn fp-btn-accent w-full py-2.5 disabled:opacity-50" disabled={busy} onClick={pay}>
          {busy ? "Обработка оплаты…" : "Оплатить подписку"}
        </button>
        <p className="text-xs mt-3" style={{ color: "var(--ink-soft)" }}>
          Демо-заглушка оплаты — платёжный провайдер подключим отдельным шагом.
        </p>
      </div>
    </div>
  );
}

function ChipMultiSelect({ options, values, onToggle, columns = 2 }) {
  return (
    <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {options.map((o) => {
        const active = values.includes(o);
        return (
          <button
            key={o} onClick={() => onToggle(o)} className="fp-card px-3 py-2 text-sm text-left"
            style={{ borderColor: active ? "var(--accent)" : "var(--line)", borderWidth: active ? 1.5 : 1, background: active ? "var(--bg)" : "#fff" }}
          >{o}</button>
        );
      })}
    </div>
  );
}

function OnboardingForm({ client, onDone }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [goal, setGoal] = useState(GOAL_OPTIONS[0]);
  const [experience, setExperience] = useState(EXPERIENCE_OPTIONS[0]);
  const [targetWeight, setTargetWeight] = useState("");

  const [gender, setGender] = useState("male");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [startWeight, setStartWeight] = useState("");

  const [injuries, setInjuries] = useState("");
  const [chronicDiseases, setChronicDiseases] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState("");

  const [dietaryRestrictions, setDietaryRestrictions] = useState([]);
  const [dislikedFoods, setDislikedFoods] = useState("");

  const [sleepHours, setSleepHours] = useState("");
  const [occupationType, setOccupationType] = useState(OCCUPATION_OPTIONS[0]);
  const [equipmentAccess, setEquipmentAccess] = useState(EQUIPMENT_OPTIONS[0]);
  const [preferredDays, setPreferredDays] = useState([]);

  const toggleIn = (arr, setArr, value) => {
    setArr(arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]);
  };

  const steps = [
    { key: "goal", title: "Цель" },
    { key: "body", title: "О себе" },
    { key: "health", title: "Здоровье" },
    { key: "food", title: "Питание" },
    { key: "lifestyle", title: "Образ жизни" },
  ];
  const isLast = step === steps.length - 1;

  const submit = async () => {
    setBusy(true);
    const onboarding = {
      goal, experience, targetWeight: targetWeight ? Number(targetWeight) : null,
      height: height ? Number(height) : null, startWeight: startWeight ? Number(startWeight) : null,
      injuries: injuries.trim(), chronicDiseases: chronicDiseases.trim(),
      allergies: allergies.trim(), medications: medications.trim(),
      dietaryRestrictions, dislikedFoods: dislikedFoods.trim(),
      sleepHours: sleepHours ? Number(sleepHours) : null, occupationType, equipmentAccess, preferredDays,
    };
    const [updated] = await Promise.all([
      completeOnboarding(client.id, onboarding),
      updateClientProfile(client.id, { gender, age: age ? Number(age) : null }),
    ]);
    onDone(updated);
  };

  const next = () => (isLast ? submit() : setStep((s) => Math.min(steps.length - 1, s + 1)));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="fp-card p-7 w-full max-w-lg">
        <Chip style={{ background: "var(--ink)", color: "#fff", marginBottom: 12 }}>АНКЕТА · ШАГ {step + 1} ИЗ {steps.length}</Chip>
        <h2 className="fp-display text-2xl font-semibold mb-1">{steps[step].title}</h2>
        <div className="fp-bar-track mb-5"><div className="fp-bar-fill" style={{ width: `${((step + 1) / steps.length) * 100}%`, background: "var(--accent)" }} /></div>

        {step === 0 && (
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Главная цель</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {GOAL_OPTIONS.map((g) => (
                <button key={g} onClick={() => setGoal(g)} className="fp-card px-3 py-2 text-sm text-left"
                  style={{ borderColor: goal === g ? "var(--accent)" : "var(--line)", borderWidth: goal === g ? 1.5 : 1 }}>{g}</button>
              ))}
            </div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Опыт тренировок</label>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {EXPERIENCE_OPTIONS.map((e) => (
                <button key={e} onClick={() => setExperience(e)} className="fp-card px-3 py-2 text-sm"
                  style={{ borderColor: experience === e ? "var(--accent)" : "var(--line)", borderWidth: experience === e ? 1.5 : 1 }}>{e}</button>
              ))}
            </div>
            <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Желаемый вес, кг (необязательно)</label>
            <input className="fp-input" type="number" value={targetWeight} onChange={(e) => setTargetWeight(e.target.value)} />
          </div>
        )}

        {step === 1 && (
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Пол</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => setGender("male")} className="fp-card px-3 py-2 text-sm" style={{ borderColor: gender === "male" ? "var(--accent)" : "var(--line)", borderWidth: gender === "male" ? 1.5 : 1 }}>Мужчина</button>
              <button onClick={() => setGender("female")} className="fp-card px-3 py-2 text-sm" style={{ borderColor: gender === "female" ? "var(--accent)" : "var(--line)", borderWidth: gender === "female" ? 1.5 : 1 }}>Женщина</button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Возраст</label>
                <input className="fp-input" type="number" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Рост, см</label>
                <input className="fp-input" type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Вес, кг</label>
                <input className="fp-input" type="number" value={startWeight} onChange={(e) => setStartWeight(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Травмы или ограничения</label>
            <textarea className="fp-input mb-3" rows={2} value={injuries} onChange={(e) => setInjuries(e.target.value)} placeholder="Оставьте пустым, если нет" />
            <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Хронические заболевания</label>
            <textarea className="fp-input mb-3" rows={2} value={chronicDiseases} onChange={(e) => setChronicDiseases(e.target.value)} placeholder="Оставьте пустым, если нет" />
            <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Аллергии (в т.ч. пищевые)</label>
            <textarea className="fp-input mb-3" rows={2} value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Оставьте пустым, если нет" />
            <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Принимаемые лекарства/добавки</label>
            <textarea className="fp-input" rows={2} value={medications} onChange={(e) => setMedications(e.target.value)} placeholder="Оставьте пустым, если нет" />
          </div>
        )}

        {step === 3 && (
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Пищевые ограничения (можно несколько)</label>
            <ChipMultiSelect options={DIET_OPTIONS} values={dietaryRestrictions} onToggle={(v) => toggleIn(dietaryRestrictions, setDietaryRestrictions, v)} />
            <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Нелюбимые продукты</label>
            <textarea className="fp-input" rows={2} value={dislikedFoods} onChange={(e) => setDislikedFoods(e.target.value)} placeholder="Что точно не стоит включать в план" />
          </div>
        )}

        {step === 4 && (
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Сон, часов в сутки</label>
            <input className="fp-input mb-3" type="number" value={sleepHours} onChange={(e) => setSleepHours(e.target.value)} />
            <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Характер работы</label>
            <div className="grid grid-cols-1 gap-2 mb-3">
              {OCCUPATION_OPTIONS.map((o) => (
                <button key={o} onClick={() => setOccupationType(o)} className="fp-card px-3 py-2 text-sm text-left"
                  style={{ borderColor: occupationType === o ? "var(--accent)" : "var(--line)", borderWidth: occupationType === o ? 1.5 : 1 }}>{o}</button>
              ))}
            </div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Где тренируетесь</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {EQUIPMENT_OPTIONS.map((o) => (
                <button key={o} onClick={() => setEquipmentAccess(o)} className="fp-card px-3 py-2 text-sm"
                  style={{ borderColor: equipmentAccess === o ? "var(--accent)" : "var(--line)", borderWidth: equipmentAccess === o ? 1.5 : 1 }}>{o}</button>
              ))}
            </div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Удобные дни для тренировок</label>
            <ChipMultiSelect options={DAY_OPTIONS} values={preferredDays} onToggle={(v) => toggleIn(preferredDays, setPreferredDays, v)} columns={4} />
          </div>
        )}

        <div className="flex gap-2 mt-5">
          {step > 0 && <button className="fp-btn fp-btn-outline flex-1 py-2.5" onClick={back}>Назад</button>}
          <button className="fp-btn fp-btn-accent flex-1 py-2.5 disabled:opacity-50" disabled={busy} onClick={next}>
            {busy ? "Сохраняем…" : isLast ? "Завершить" : "Далее"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientHome({ client, onLogout, authUserId }) {
  const [tab, setTab] = useState("today");
  const [workouts, setWorkouts] = useState([]);
  const [loadingWorkouts, setLoadingWorkouts] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [viewingWorkout, setViewingWorkout] = useState(null);
  const [pushStatus, setPushStatus] = useState(null);
  const plan = PLANS.find((p) => p.id === client.plan);
  const isVip = client.plan === "vip";

  const loadWorkouts = () => {
    setLoadingWorkouts(true);
    fetchWorkoutsForClient(client.id).then((w) => { setWorkouts(w); setLoadingWorkouts(false); });
  };

  useEffect(() => { loadWorkouts(); }, [client.id]);

  const handleToggleExercise = async (exerciseId, currentDone) => {
    setWorkouts((prev) => prev.map((w) => ({
      ...w,
      workout_exercises: w.workout_exercises.map((e) => (e.id === exerciseId ? { ...e, done: !currentDone } : e)),
    })));
    await toggleExerciseDone(exerciseId, !currentDone);
  };

  const handleFinishSession = async (payload) => {
    await saveWorkoutSession(client.id, payload);
    setActiveSession(null);
    loadWorkouts();
  };

  const handleEnablePush = async () => {
    setPushStatus("busy");
    try {
      const res = await enablePushNotifications(authUserId);
      setPushStatus(res.ok ? "on" : res.reason);
    } catch (e) {
      setPushStatus("unexpected");
    }
  };

  if (activeSession) {
    return <WorkoutSession workout={activeSession} onExit={() => setActiveSession(null)} onFinish={handleFinishSession} />;
  }

  const navItems = [
    { key: "progress", label: "Прогресс", icon: TrendingUp },
    { key: "nutrition", label: "Питание", icon: Apple },
    { key: "today", label: "Сегодня", icon: Dumbbell, primary: true },
    ...(isVip ? [{ key: "chat", label: "Чат", icon: MessageCircle }] : []),
    { key: "profile", label: "Профиль", icon: User },
  ];

  return (
    <div className="min-h-screen fp-page-with-nav">
      <PageHeader eyebrow="КЛИЕНТ" title={client.name} subtitle={`Тариф «${plan.name}»`} />

      <div className="fp-content-with-header pb-6">
        {tab === "today" && (
          <div className="px-4 space-y-3">
            {loadingWorkouts ? (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>
            ) : workouts.length === 0 ? (
              <ComingSoonCard icon={Dumbbell} title="Заданий пока нет" text="Тренер ещё не назначил вам тренировку." />
            ) : (() => {
              const isAllDone = (w) => {
                const total = w.workout_exercises.length;
                const done = w.workout_exercises.filter((e) => e.done).length;
                return total > 0 && done === total;
              };
              const queue = [...workouts].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
              const currentIndex = queue.findIndex((w) => !isAllDone(w));
              const current = currentIndex === -1 ? null : queue[currentIndex];
              // Только пройденные + текущая — то, что ещё впереди в очереди, клиенту не показываем.
              const history = (currentIndex === -1 ? queue : queue.slice(0, currentIndex)).slice().reverse();

              return (
                <>
                  {current ? (
                    <div className="fp-card p-4">
                      <div className="font-semibold mb-3">{current.title}</div>
                      <ul className="space-y-2.5 mb-3">
                        {current.workout_exercises.map((e) => (
                          <li key={e.id} className="flex items-center gap-3">
                            <div className={`fp-checkbox ${e.done ? "done" : ""}`} onClick={() => handleToggleExercise(e.id, e.done)}>
                              {e.done && <CheckCircle2 size={16} color="#fff" />}
                            </div>
                            <div>
                              <div style={{ textDecoration: e.done ? "line-through" : "none", color: e.done ? "var(--ink-soft)" : "var(--ink)" }}>{e.name}</div>
                              <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{formatSets(e.sets)}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <button className="fp-btn fp-btn-accent w-full py-2.5" onClick={() => setActiveSession(current)}>
                        Начать тренировку
                      </button>
                    </div>
                  ) : (
                    <ComingSoonCard icon={CheckCircle2} title="Все тренировки выполнены" text="Ждите новое задание от тренера." />
                  )}

                  {history.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold mt-2 mb-2" style={{ color: "var(--ink-soft)" }}>АРХИВ ПРОЙДЕННЫХ ({history.length})</div>
                      <div className="space-y-2">
                        {history.map((w) => (
                          <div key={w.id} className="fp-card p-3 flex items-center justify-between">
                            <span className="text-sm">{w.title}</span>
                            <div className="flex items-center gap-3">
                              <button onClick={() => setViewingWorkout(w)} className="flex items-center justify-center" style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid var(--ink-soft)", color: "var(--ink-soft)", fontSize: 11, fontWeight: 700, fontStyle: "italic" }}>i</button>
                              <CheckCircle2 size={16} color="var(--accent-2)" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {viewingWorkout && (
                    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(22,32,42,0.5)", zIndex: 50 }}>
                      <div className="fp-card p-5 w-full max-w-sm" style={{ maxHeight: "80vh", overflowY: "auto" }}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-semibold">{viewingWorkout.title}</span>
                          <button onClick={() => setViewingWorkout(null)}><X size={18} color="var(--ink-soft)" /></button>
                        </div>
                        <ul className="text-sm space-y-2">
                          {viewingWorkout.workout_exercises.map((e) => (
                            <li key={e.id}>
                              <div>{e.name}</div>
                              <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{formatSets(e.sets)}</div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
        {tab === "nutrition" && <NutritionTab client={client} />}
        {tab === "progress" && <ProgressTab client={client} />}
        {tab === "chat" && isVip && (
          <ChatPanel clientId={client.id} currentSender={client.name} senderRole="client" authUserId={authUserId} />
        )}
        {tab === "profile" && (
          <div className="px-4">
            <div className="fp-card p-4 mb-3">
              <div className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>АНКЕТА</div>
              <div className="text-sm space-y-1">
                <div><span style={{ color: "var(--ink-soft)" }}>Цель: </span>{client.onboarding?.goal}</div>
                <div><span style={{ color: "var(--ink-soft)" }}>Опыт: </span>{client.onboarding?.experience}</div>
              </div>
            </div>

            {pushSupported() && (
              <div className="fp-card p-4 mb-3">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
                  <Bell size={13} /> УВЕДОМЛЕНИЯ
                </div>
                {pushStatus === "on" ? (
                  <p className="text-xs" style={{ color: "var(--accent-2)" }}>Уведомления включены ✓</p>
                ) : (
                  <>
                    <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>
                      Получайте push-уведомления о новых сообщениях от тренера.
                    </p>
                    <button className="fp-btn fp-btn-outline w-full py-2 text-xs" onClick={handleEnablePush} disabled={pushStatus === "busy"}>
                      {pushStatus === "busy" ? "Включаем…" : "Включить уведомления"}
                    </button>
                    {pushStatus && pushStatus !== "busy" && PUSH_ERROR_MESSAGES[pushStatus] && (
                      <p className="text-xs mt-2" style={{ color: "var(--danger)" }}>{PUSH_ERROR_MESSAGES[pushStatus]}</p>
                    )}
                  </>
                )}
              </div>
            )}

            <button className="fp-btn fp-btn-outline w-full py-2.5 flex items-center justify-center gap-2" onClick={onLogout}>
              <LogOut size={14} /> Выйти
            </button>
          </div>
        )}
      </div>

      <BottomNav items={navItems} active={tab} onChange={setTab} />
    </div>
  );
}

function TrainerClientDetail({ client: initialClient, trainer, onBack }) {
  const [client, setClient] = useState(initialClient);
  const [tab, setTab] = useState("workouts");
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignMode, setAssignMode] = useState(null); // null | 'custom' | 'template'
  const isVip = client.plan === "vip";

  const load = () => {
    setLoading(true);
    fetchWorkoutsForClient(client.id).then((w) => { setWorkouts(w); setLoading(false); });
  };

  useEffect(() => { load(); }, [client.id]);

  const handleAssign = async (title, items) => {
    await createWorkout(client.id, title, items);
    setAssignMode(null);
    load();
  };

  return (
    <div className="min-h-screen">
      <div className="fp-fixed-header px-4">
        <div className="max-w-lg mx-auto">
          <button onClick={onBack} className="flex items-center gap-1 text-sm mb-2" style={{ color: "var(--ink-soft)" }}>
            <ChevronLeft size={16} /> К списку клиентов
          </button>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="fp-display text-lg font-semibold">{client.name}</h2>
            <Chip style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>
              {PLANS.find((p) => p.id === client.plan)?.name}
            </Chip>
          </div>
          <div className="flex gap-4 overflow-x-auto fp-scroll" style={{ borderBottom: "1px solid var(--line)" }}>
            {[
              { key: "workouts", label: "Тренировки" },
              { key: "periodization", label: "Периодизация" },
              { key: "nutrition", label: "Питание" },
              { key: "progress", label: "Прогресс" },
              ...(isVip ? [{ key: "chat", label: "Чат" }] : []),
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="text-sm pb-2 whitespace-nowrap"
                style={{ fontWeight: 600, color: tab === t.key ? "var(--ink)" : "var(--ink-soft)", borderBottom: tab === t.key ? "2px solid var(--accent)" : "none" }}
              >{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="fp-content-with-tall-header px-4 pb-10 max-w-lg mx-auto">

      {tab === "nutrition" ? (
        <TrainerNutritionPanel client={client} onClientUpdated={(updated) => updated && setClient(updated)} />
      ) : tab === "progress" ? (
        <TrainerProgressPanel client={client} />
      ) : tab === "periodization" ? (
        <PeriodizationPanel client={client} />
      ) : tab === "chat" && isVip ? (
        <ChatPanel clientId={client.id} currentSender={trainer.name} senderRole="trainer" authUserId={trainer.auth_user_id} />
      ) : (
        <>
          {assignMode === "custom" ? (
            <AssignWorkoutForm onAssign={handleAssign} onCancel={() => setAssignMode(null)} />
          ) : assignMode === "template" ? (
            <div className="fp-card p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">Выберите шаблон</span>
                <button onClick={() => setAssignMode(null)} className="text-xs" style={{ color: "var(--ink-soft)" }}>Отмена</button>
              </div>
              <AssignFromTemplate trainer={trainer} clientId={client.id} onAssigned={() => { setAssignMode(null); load(); }} />
            </div>
          ) : assignMode === "microcycle" ? (
            <div className="fp-card p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">Выберите микроцикл</span>
                <button onClick={() => setAssignMode(null)} className="text-xs" style={{ color: "var(--ink-soft)" }}>Отмена</button>
              </div>
              <AssignMicrocycle trainer={trainer} clientId={client.id} onAssigned={() => { setAssignMode(null); load(); }} />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 mb-5">
              <button className="fp-btn fp-btn-accent px-2 py-2.5 flex flex-col items-center justify-center gap-1 text-[11px]" onClick={() => setAssignMode("custom")}>
                <Dumbbell size={15} /> Своя
              </button>
              <button className="fp-btn fp-btn-outline px-2 py-2.5 flex flex-col items-center justify-center gap-1 text-[11px]" onClick={() => setAssignMode("template")}>
                <Copy size={15} /> Шаблон
              </button>
              <button className="fp-btn fp-btn-outline px-2 py-2.5 flex flex-col items-center justify-center gap-1 text-[11px]" onClick={() => setAssignMode("microcycle")}>
                <CalendarDays size={15} /> Микроцикл
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>
          ) : workouts.length === 0 && !assignMode ? (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Заданий пока нет.</p>
          ) : (
            <div className="space-y-3">
              {workouts.map((w) => {
                const doneCount = w.workout_exercises.filter((e) => e.done).length;
                return (
                  <div key={w.id} className="fp-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{w.title}</div>
                      <Chip style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>{doneCount}/{w.workout_exercises.length}</Chip>
                    </div>
                    <ul className="text-sm space-y-1">
                      {w.workout_exercises.map((e) => (
                        <li key={e.id} className="flex items-center gap-2">
                          {e.done ? <CheckCircle2 size={14} color="var(--accent-2)" /> : <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--line)", display: "inline-block" }} />}
                          <span style={{ color: e.done ? "var(--ink-soft)" : "var(--ink)", textDecoration: e.done ? "line-through" : "none" }}>
                            {e.name} — {formatSets(e.sets)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}

function TrainerHome({ trainer, clients, onLogout, authUserId }) {
  const [tab, setTab] = useState("overview");
  const [selectedClient, setSelectedClient] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMicrocycles, setShowMicrocycles] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [pushStatus, setPushStatus] = useState(null);
  const vipClients = clients.filter((c) => c.plan === "vip");

  if (selectedClient) {
    return <TrainerClientDetail client={selectedClient} trainer={trainer} onBack={() => setSelectedClient(null)} />;
  }

  if (showTemplates) {
    return (
      <div className="min-h-screen fp-safe-top py-6">
        <button onClick={() => setShowTemplates(false)} className="flex items-center gap-1 text-sm mb-4 px-4" style={{ color: "var(--ink-soft)" }}>
          <ChevronLeft size={16} /> К обзору
        </button>
        <TemplateManager trainer={trainer} />
      </div>
    );
  }

  if (showMicrocycles) {
    return (
      <div className="min-h-screen fp-safe-top py-6">
        <button onClick={() => setShowMicrocycles(false)} className="flex items-center gap-1 text-sm mb-4 px-4" style={{ color: "var(--ink-soft)" }}>
          <ChevronLeft size={16} /> К обзору
        </button>
        <MicrocycleManager trainer={trainer} />
      </div>
    );
  }

  if (showLeaderboard) {
    return (
      <div className="min-h-screen fp-safe-top py-6">
        <TrainerLeaderboard trainer={trainer} clients={clients} onBack={() => setShowLeaderboard(false)} />
      </div>
    );
  }

  const handleEnablePush = async () => {
    setPushStatus("busy");
    try {
      const res = await enablePushNotifications(authUserId);
      setPushStatus(res.ok ? "on" : res.reason);
    } catch (e) {
      setPushStatus("unexpected");
    }
  };

  const navItems = [
    { key: "overview", label: "Обзор", icon: LayoutGrid },
    { key: "clients", label: "Клиенты", icon: Users },
    { key: "chats", label: "Чаты", icon: MessageCircle },
    { key: "profile", label: "Профиль", icon: User },
  ];

  const attentionClients = clients.filter((c) => !c.subscription_active);

  return (
    <div className="min-h-screen fp-page-with-nav">
      <PageHeader eyebrow="ТРЕНЕР" title={trainer.name} subtitle={trainer.spec} />

      <div className="fp-content-with-header pb-6">
        {tab === "overview" && (
          <div className="px-4">
            <div className="fp-scoreboard p-5 grid grid-cols-2 gap-4 mb-5">
              <div><div className="num">{clients.length}</div><div className="text-xs opacity-70 mt-1">Клиентов</div></div>
              <div><div className="num">{vipClients.length}</div><div className="text-xs opacity-70 mt-1">На VIP</div></div>
            </div>
            <button onClick={() => setShowTemplates(true)} className="fp-card w-full p-3 mb-3 flex items-center justify-between text-left">
              <div className="flex items-center gap-2">
                <Layers size={16} color="var(--accent)" />
                <span className="text-sm font-medium">Шаблоны тренировок</span>
              </div>
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Управлять →</span>
            </button>
            <button onClick={() => setShowMicrocycles(true)} className="fp-card w-full p-3 mb-3 flex items-center justify-between text-left">
              <div className="flex items-center gap-2">
                <CalendarDays size={16} color="var(--accent)" />
                <span className="text-sm font-medium">Микроциклы</span>
              </div>
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Управлять →</span>
            </button>
            <button onClick={() => setShowLeaderboard(true)} className="fp-card w-full p-3 mb-5 flex items-center justify-between text-left">
              <div className="flex items-center gap-2">
                <Trophy size={16} color="var(--accent)" />
                <span className="text-sm font-medium">Рейтинг по упражнению</span>
              </div>
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Смотреть →</span>
            </button>
            {attentionClients.length > 0 && (
              <div className="mb-5">
                <div className="text-xs mb-2 font-semibold" style={{ color: "var(--ink-soft)" }}>ТРЕБУЮТ ВНИМАНИЯ</div>
                <div className="space-y-2">
                  {attentionClients.map((c) => (
                    <button key={c.id} onClick={() => setSelectedClient(c)} className="fp-card w-full p-3 text-left" style={{ borderColor: "#FFD9C7" }}>
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs" style={{ color: "var(--accent)" }}>Оплата не проведена</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="text-xs mb-2 font-semibold" style={{ color: "var(--ink-soft)" }}>ВСЕ КЛИЕНТЫ</div>
            {clients.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Пока нет клиентов на тарифах «Индивидуальный план» и «VIP».</p>
            ) : (
              <div className="space-y-2">
                {clients.map((c) => (
                  <button key={c.id} onClick={() => setSelectedClient(c)} className="fp-card p-3 flex items-center justify-between w-full text-left">
                    <span className="text-sm font-medium">{c.name}</span>
                    <Chip style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>{PLANS.find((p) => p.id === c.plan)?.name}</Chip>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "clients" && (
          <div className="px-4">
            <div className="flex items-center gap-1.5 mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
              <Users size={13} /> КЛИЕНТЫ ({clients.length})
            </div>
            {clients.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Пока нет клиентов на тарифах «Индивидуальный план» и «VIP».</p>
            ) : (
              <div className="space-y-2">
                {clients.map((c) => (
                  <button key={c.id} onClick={() => setSelectedClient(c)} className="fp-card p-3 flex items-center justify-between w-full text-left">
                    <span className="text-sm font-medium">{c.name}</span>
                    <Chip style={{ background: "var(--bg)", color: "var(--ink-soft)" }}>{PLANS.find((p) => p.id === c.plan)?.name}</Chip>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "chats" && (
          <TrainerInbox trainer={trainer} clients={vipClients} onOpenChat={setSelectedClient} />
        )}

        {tab === "profile" && (
          <div className="px-4">
            {pushSupported() && (
              <div className="fp-card p-4 mb-3">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
                  <Bell size={13} /> УВЕДОМЛЕНИЯ
                </div>
                {pushStatus === "on" ? (
                  <p className="text-xs" style={{ color: "var(--accent-2)" }}>Уведомления включены ✓</p>
                ) : (
                  <>
                    <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>Получайте push о новых сообщениях от клиентов.</p>
                    <button className="fp-btn fp-btn-outline w-full py-2 text-xs" onClick={handleEnablePush} disabled={pushStatus === "busy"}>
                      {pushStatus === "busy" ? "Включаем…" : "Включить уведомления"}
                    </button>
                    {pushStatus && pushStatus !== "busy" && PUSH_ERROR_MESSAGES[pushStatus] && (
                      <p className="text-xs mt-2" style={{ color: "var(--danger)" }}>{PUSH_ERROR_MESSAGES[pushStatus]}</p>
                    )}
                  </>
                )}
              </div>
            )}
            <button className="fp-btn fp-btn-outline w-full py-2.5 flex items-center justify-center gap-2" onClick={onLogout}>
              <LogOut size={14} /> Выйти
            </button>
          </div>
        )}
      </div>

      <BottomNav items={navItems} active={tab} onChange={setTab} />
    </div>
  );
}

/* ----------------------------------- APP ----------------------------------- */

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [screen, setScreen] = useState("login");
  const [trainers, setTrainers] = useState([]);
  const [trainer, setTrainer] = useState(null);
  const [client, setClient] = useState(null);

  useEffect(() => { fetchTrainers().then(setTrainers).catch(() => {}); }, []);

  const resolveRole = async (currentSession) => {
    if (!currentSession) { setTrainer(null); setClient(null); setLoading(false); return; }
    const authId = currentSession.user.id;
    const trainerRow = await fetchTrainerByAuthId(authId);
    if (trainerRow) {
      const clients = await fetchClientsForTrainer(trainerRow.id);
      setTrainer({ ...trainerRow, clients });
      setClient(null);
      setLoading(false);
      return;
    }
    const clientRow = await fetchClientByAuthId(authId);
    setClient(clientRow);
    setTrainer(null);
    setLoading(false);
  };

  useEffect(() => {
    getSession().then((s) => { setSession(s); resolveRole(s); });
    const sub = onAuthChange((s) => { setSession(s); resolveRole(s); });
    return () => sub.unsubscribe();
  }, []);

  const handleLogout = async () => { await signOut(); setScreen("login"); };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</div>;

  if (!session) {
    if (screen === "trainer-login") return <TrainerLoginScreen onBack={() => setScreen("login")} onLoggedIn={() => {}} />;
    if (screen === "client-entry") return <ClientEntryScreen onBack={() => setScreen("login")} onLoggedIn={() => {}} />;
    return <LoginScreen trainers={trainers} onPickTrainerLogin={() => setScreen("trainer-login")} onPickClientEntry={() => setScreen("client-entry")} />;
  }

  if (trainer) return <TrainerHome trainer={trainer} clients={trainer.clients} onLogout={handleLogout} authUserId={session.user.id} />;

  if (client) {
    if (!client.subscription_active) return <SubscribeGate client={client} onPaid={setClient} />;
    if (!client.onboarding_complete) return <OnboardingForm client={client} onDone={setClient} />;
    return <ClientHome client={client} onLogout={handleLogout} authUserId={session.user.id} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="fp-card p-6 max-w-sm text-center">
        <p className="text-sm mb-3">Не нашли профиль тренера или клиента для этого аккаунта.</p>
        <button className="fp-btn fp-btn-outline" onClick={handleLogout}>Выйти</button>
      </div>
    </div>
  );
}
