import React, { useState, useEffect } from "react";
import {
  Dumbbell, Apple, TrendingUp, User, CheckCircle2, LogOut, ChevronLeft,
  Users, Sparkles, MessageCircle, LayoutGrid, Bell,
} from "lucide-react";
import "./App.css";
import { AssignWorkoutForm, WorkoutSession, formatSets } from "./components/Workouts";
import { NutritionTab, TrainerNutritionPanel } from "./components/Nutrition";
import { ChatPanel, TrainerInbox } from "./components/Chat";
import { ProgressTab, TrainerProgressPanel } from "./components/Progress";
import { enablePushNotifications, pushSupported } from "./lib/push";
import {
  getSession, onAuthChange, signUp, signIn, signOut,
  fetchTrainers, fetchTrainerByAuthId, fetchClientsForTrainer,
  fetchClientByAuthId, createClientProfile, activateSubscription, completeOnboarding,
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

/* -------------------------------- SHARED UI -------------------------------- */

function Chip({ children, style }) {
  return <span className="fp-chip" style={style}>{children}</span>;
}

function PageHeader({ eyebrow, title, subtitle, onLogout }) {
  return (
    <div className="fp-sticky-header px-4">
      <div className="flex items-start justify-between">
        <div>
          <Chip style={{ background: "var(--ink)", color: "#fff", marginBottom: 8 }}>{eyebrow}</Chip>
          <h1 className="fp-display text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>{subtitle}</p>}
        </div>
        {onLogout && (
          <button onClick={onLogout} className="fp-btn fp-btn-outline px-3 py-2 flex items-center gap-1.5 text-xs">
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
      {items.map((it) => (
        <button
          key={it.key}
          className={`fp-bottom-nav-item ${active === it.key ? "active" : ""}`}
          onClick={() => onChange(it.key)}
        >
          <it.icon size={20} />
          <span className="label">{it.label}</span>
        </button>
      ))}
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

function OnboardingForm({ client, onDone }) {
  const [goal, setGoal] = useState(GOAL_OPTIONS[0]);
  const [experience, setExperience] = useState(EXPERIENCE_OPTIONS[0]);
  const [injuries, setInjuries] = useState("");
  const [height, setHeight] = useState("");
  const [startWeight, setStartWeight] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const updated = await completeOnboarding(client.id, {
      goal, experience, injuries: injuries.trim(),
      height: height ? Number(height) : null,
      startWeight: startWeight ? Number(startWeight) : null,
    });
    onDone(updated);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="fp-card p-7 w-full max-w-lg">
        <Chip style={{ background: "var(--ink)", color: "#fff", marginBottom: 12 }}>АНКЕТА</Chip>
        <h2 className="fp-display text-2xl font-semibold mb-1">Расскажите о себе, {client.name.split(" ")[0]}</h2>
        <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>Поможет тренеру составить план под вас.</p>

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

        <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Травмы или ограничения (необязательно)</label>
        <textarea className="fp-input mb-4" rows={2} value={injuries} onChange={(e) => setInjuries(e.target.value)}
          placeholder="Оставьте пустым, если ограничений нет" />

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Рост, см</label>
            <input className="fp-input" type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Текущий вес, кг</label>
            <input className="fp-input" type="number" value={startWeight} onChange={(e) => setStartWeight(e.target.value)} />
          </div>
        </div>

        <button className="fp-btn fp-btn-accent w-full py-2.5 disabled:opacity-50" disabled={busy} onClick={submit}>
          {busy ? "Сохраняем…" : "Продолжить"}
        </button>
      </div>
    </div>
  );
}

function ClientHome({ client, onLogout, authUserId }) {
  const [tab, setTab] = useState("today");
  const [workouts, setWorkouts] = useState([]);
  const [loadingWorkouts, setLoadingWorkouts] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
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
    const res = await enablePushNotifications(authUserId);
    setPushStatus(res.ok ? "on" : res.reason);
  };

  if (activeSession) {
    return <WorkoutSession workout={activeSession} onExit={() => setActiveSession(null)} onFinish={handleFinishSession} />;
  }

  const navItems = [
    { key: "today", label: "Сегодня", icon: Dumbbell },
    { key: "nutrition", label: "Питание", icon: Apple },
    { key: "progress", label: "Прогресс", icon: TrendingUp },
    ...(isVip ? [{ key: "chat", label: "Чат", icon: MessageCircle }] : []),
    { key: "profile", label: "Профиль", icon: User },
  ];

  return (
    <div className="min-h-screen fp-page-with-nav">
      {tab !== "chat" && <PageHeader eyebrow="КЛИЕНТ" title={client.name} subtitle={`Тариф «${plan.name}»`} />}

      <div className={tab === "chat" ? "pt-4" : "pt-2 pb-6"}>
        {tab === "today" && (
          <div className="px-4 space-y-3">
            {loadingWorkouts ? (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>
            ) : workouts.length === 0 ? (
              <ComingSoonCard icon={Dumbbell} title="Заданий пока нет" text="Тренер ещё не назначил вам тренировку." />
            ) : (
              workouts.map((w) => (
                <div key={w.id} className="fp-card p-4">
                  <div className="font-semibold mb-3">{w.title}</div>
                  <ul className="space-y-2.5 mb-3">
                    {w.workout_exercises.map((e) => (
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
                  <button className="fp-btn fp-btn-accent w-full py-2.5" onClick={() => setActiveSession(w)}>
                    Начать тренировку
                  </button>
                </div>
              ))
            )}
          </div>
        )}
        {tab === "nutrition" && <NutritionTab client={client} />}
        {tab === "progress" && <ProgressTab client={client} />}
        {tab === "chat" && isVip && (
          <div>
            <div className="px-4 pb-2">
              <button onClick={() => setTab("today")} className="flex items-center gap-1 text-sm" style={{ color: "var(--ink-soft)" }}>
                <ChevronLeft size={16} /> Назад
              </button>
              <h2 className="fp-display text-xl font-semibold mt-1">Чат с тренером</h2>
            </div>
            <ChatPanel clientId={client.id} currentSender={client.name} senderRole="client" authUserId={authUserId} />
          </div>
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
                    {pushStatus === "denied" && <p className="text-xs mt-2" style={{ color: "var(--danger)" }}>Уведомления заблокированы в настройках браузера.</p>}
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
  const [showAssign, setShowAssign] = useState(false);
  const isVip = client.plan === "vip";

  const load = () => {
    setLoading(true);
    fetchWorkoutsForClient(client.id).then((w) => { setWorkouts(w); setLoading(false); });
  };

  useEffect(() => { load(); }, [client.id]);

  const handleAssign = async (title, items) => {
    await createWorkout(client.id, title, items);
    setShowAssign(false);
    load();
  };

  return (
    <div className="min-h-screen px-4 py-6 max-w-lg mx-auto">
      <button onClick={onBack} className="flex items-center gap-1 text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
        <ChevronLeft size={16} /> К списку клиентов
      </button>
      <h2 className="fp-display text-2xl font-semibold mb-1">{client.name}</h2>
      <Chip style={{ background: "var(--bg)", color: "var(--ink-soft)", marginBottom: 16 }}>
        {PLANS.find((p) => p.id === client.plan)?.name}
      </Chip>

      <div className="flex gap-4 mb-5 overflow-x-auto fp-scroll" style={{ borderBottom: "1px solid var(--line)" }}>
        {[
          { key: "workouts", label: "Тренировки" },
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

      {tab === "nutrition" ? (
        <TrainerNutritionPanel client={client} onClientUpdated={(updated) => updated && setClient(updated)} />
      ) : tab === "progress" ? (
        <TrainerProgressPanel client={client} />
      ) : tab === "chat" && isVip ? (
        <ChatPanel clientId={client.id} currentSender={trainer.name} senderRole="trainer" authUserId={trainer.auth_user_id} />
      ) : (
        <>
          {showAssign ? (
            <AssignWorkoutForm onAssign={handleAssign} onCancel={() => setShowAssign(false)} />
          ) : (
            <button className="fp-btn fp-btn-accent px-4 py-2.5 mb-5 flex items-center gap-2" onClick={() => setShowAssign(true)}>
              <Dumbbell size={15} /> Назначить тренировку
            </button>
          )}

          {loading ? (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>
          ) : workouts.length === 0 && !showAssign ? (
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
  );
}

function TrainerHome({ trainer, clients, onLogout, authUserId }) {
  const [tab, setTab] = useState("overview");
  const [selectedClient, setSelectedClient] = useState(null);
  const [pushStatus, setPushStatus] = useState(null);
  const vipClients = clients.filter((c) => c.plan === "vip");

  if (selectedClient) {
    return <TrainerClientDetail client={selectedClient} trainer={trainer} onBack={() => setSelectedClient(null)} />;
  }

  const handleEnablePush = async () => {
    setPushStatus("busy");
    const res = await enablePushNotifications(authUserId);
    setPushStatus(res.ok ? "on" : res.reason);
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

      <div className="pt-2 pb-6">
        {tab === "overview" && (
          <div className="px-4">
            <div className="fp-scoreboard p-5 grid grid-cols-2 gap-4 mb-5">
              <div><div className="num">{clients.length}</div><div className="text-xs opacity-70 mt-1">Клиентов</div></div>
              <div><div className="num">{vipClients.length}</div><div className="text-xs opacity-70 mt-1">На VIP</div></div>
            </div>
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
