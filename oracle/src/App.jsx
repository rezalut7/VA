import { useEffect, useMemo, useState } from "react";
import { api, authenticate, share } from "./api.js";

const modes = [
  { id: "daily", icon: "✦", title: "Карта дня", subtitle: "Ваш символ и настроение дня" },
  { id: "oracle", icon: "◐", title: "Спросить оракула", subtitle: "Любовь, деньги, карьера или общий вопрос" },
  { id: "tarot", icon: "♢", title: "Расклад Таро", subtitle: "Одна, три или семь карт" },
  { id: "compatibility", icon: "∞", title: "Совместимость", subtitle: "Динамика отношений по двум датам" },
  { id: "dream", icon: "☾", title: "Толкование сна", subtitle: "Символы, чувства и возможные смыслы" },
];

const fields = {
  oracle: [
    ["question", "Ваш вопрос", "textarea", "Что сейчас важно понять?"],
    ["sphere", "Сфера", "select", ["общее", "любовь", "деньги", "карьера"]],
  ],
  tarot: [
    ["question", "Тема расклада", "textarea", "О чём хотите поразмышлять?"],
    ["cards", "Количество карт", "select", ["1", "3", "7"]],
  ],
  compatibility: [
    ["firstName", "Первое имя", "text", "Анна"],
    ["firstBirthDate", "Дата рождения", "date", ""],
    ["secondName", "Второе имя", "text", "Михаил"],
    ["secondBirthDate", "Дата рождения", "date", ""],
    ["relationship", "Тип отношений", "select", ["романтические", "дружеские", "деловые"]],
  ],
  dream: [["dream", "Опишите сон", "textarea", "Что происходило и что вы чувствовали?"]],
};

function Nav({ page, setPage }) {
  return <nav className="nav">
    {[['home','⌂','Главная'],['history','◷','История'],['profile','♙','Профиль']].map(([id,icon,label]) =>
      <button key={id} className={page===id?'active':''} onClick={()=>setPage(id)}><b>{icon}</b><span>{label}</span></button>
    )}
  </nav>;
}

function Result({ result, onClose }) {
  if (!result) return null;
  return <div className="result-overlay"><article className="result-card">
    <button className="close" onClick={onClose}>×</button>
    <div className="result-sigil">✦</div>
    <p className="eyebrow">Послание для вас</p>
    <h2>{result.title}</h2>
    {result.cards?.length ? <div className={`tarot-deck deck-${Math.min(result.cards.length,7)}`}>{result.cards.map((card,index)=><div className="tarot-card" key={`${card}-${index}`}><div className="card-art"/><b>{card}</b></div>)}</div> : null}
    {result.score ? <div className="score">{result.score}%</div> : null}
    <p className="reading">{result.text}</p>
    <p className="reflection">{result.reflection}</p>
    <button className="primary" onClick={()=>share(`${result.title}\n\n${result.text}`)}>Поделиться в Telegram</button>
  </article></div>;
}

export default function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState({ sphere:"общее", cards:"1", relationship:"романтические" });
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const greeting = useMemo(()=>new Date().getHours()<12?'Доброе утро':new Date().getHours()<18?'Добрый день':'Добрый вечер',[]);

  useEffect(()=>{ authenticate().then(setUser).catch(e=>setError(e.message)).finally(()=>setLoading(false)); },[]);
  useEffect(()=>{ if(page==='history') api('/api/history').then(r=>setHistory(r.items)).catch(e=>setError(e.message)); if(page==='profile'&&user?.isAdmin) api('/api/admin/stats').then(setAdminStats).catch(()=>{}); },[page,user?.isAdmin]);

  async function openMode(id) {
    setError("");
    if (id === "daily") {
      setLoading(true);
      try { setResult(await api('/api/daily')); } catch(e) { setError(e.message); }
      finally { setLoading(false); }
      return;
    }
    setMode(id);
  }

  async function submit(e) {
    e.preventDefault(); setLoading(true); setError("");
    try { setResult(await api(`/api/readings/${mode}`, {method:'POST', body:JSON.stringify(form)})); setMode(null); }
    catch(e) { setError(e.status===402?'Дневной лимит исчерпан. Подключите Premium или купите дополнительные запросы.':e.message); }
    finally { setLoading(false); }
  }

  async function buy(product) {
    try {
      const { invoiceLink } = await api('/api/payments/invoice',{method:'POST',body:JSON.stringify({product})});
      window.Telegram?.WebApp?.openInvoice ? window.Telegram.WebApp.openInvoice(invoiceLink,()=>location.reload()) : window.open(invoiceLink,'_blank');
    } catch(e) { setError(e.message); }
  }

  async function toggleReminder(){
    try { const next=!user.reminderEnabled; await api('/api/me/reminder',{method:'POST',body:JSON.stringify({enabled:next})}); setUser({...user,reminderEnabled:next}); }
    catch(e){setError(e.message)}
  }

  async function favorite(id){
    try { const r=await api(`/api/history/${id}/favorite`,{method:'POST'}); setHistory(history.map(x=>x.id===id?{...x,favorite:r.favorite}:x)); }
    catch(e){setError(e.message)}
  }

  if (loading && !user) return <main className="splash"><img className="brand-portrait" src="/assets/madam-agrippina-avatar.webp" alt="Мадам Агриппина"/><h1>Мадам Агриппина</h1><p>Слушаю тишину между звёздами…</p></main>;

  return <div className="app">
    <header><div><p className="eyebrow">{greeting}</p><h1>{user?.firstName || 'Путник'}</h1></div><div className="streak">🔥 {user?.streak || 1}</div></header>
    {error && <div className="error" onClick={()=>setError('')}>{error}</div>}

    {page==='home' && <main>
      <section className="hero"><div className="hero-card"><img src="/assets/tarot-card-back.webp" alt="Мистическая карта"/></div><p className="eyebrow">Сегодня · {new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}</p><h2>Ответ уже рядом</h2><p>Выберите практику, чтобы взглянуть на ситуацию с новой стороны.</p><button className="primary" onClick={()=>openMode('daily')}>Открыть карту дня</button></section>
      <div className="balance"><span>Бесплатных запросов сегодня</span><b>{user?.requestsLeft ?? 3}</b></div>
      <section className="mode-grid">{modes.slice(1).map(item=><button className="mode" key={item.id} onClick={()=>openMode(item.id)}><i>{item.icon}</i><span><b>{item.title}</b><small>{item.subtitle}</small></span><em>›</em></button>)}</section>
      <section className="premium"><span>✧</span><div><p className="eyebrow">Premium на 7 дней</p><h3>Больше глубины, без лимитов</h3></div><button onClick={()=>buy('premium_week')}>149 ★</button></section>
      <p className="disclaimer">Сервис создан для развлечения и саморефлексии. Он не заменяет профессиональные медицинские, юридические или финансовые рекомендации.</p>
    </main>}

    {page==='history' && <main><div className="section-title"><p className="eyebrow">Ваш путь</p><h2>История посланий</h2></div>{history.length?history.map(item=><article className="history" key={item.id}><span>{item.icon || '✦'}</span><div><b>{item.title}</b><p>{item.preview}</p><small>{new Date(item.createdAt).toLocaleDateString('ru-RU')}</small></div><button className={item.favorite?'fav active':'fav'} onClick={()=>favorite(item.id)}>♥</button></article>):<div className="empty">Здесь появятся ваши расклады и толкования.</div>}</main>}

    {page==='profile' && <main><div className="profile-card"><div className="avatar"><img src="/assets/madam-agrippina-avatar.webp" alt="Мадам Агриппина"/></div><h2>{user?.firstName||'Путник'}</h2><p>{user?.premiumUntil ? `Premium до ${new Date(user.premiumUntil).toLocaleDateString('ru-RU')}`:'Базовый доступ'}</p><div className="stats"><div><b>{user?.totalReadings||0}</b><span>посланий</span></div><div><b>{user?.referrals||0}</b><span>друзей</span></div><div><b>{user?.streak||1}</b><span>дней подряд</span></div></div><button className="primary" onClick={()=>share(`Присоединяйся к Мадам Агриппине AI\n${location.origin}?startapp=ref_${user?.referralCode}`)}>Пригласить друга</button><button className="ghost" onClick={()=>buy('extra_requests')}>Купить 10 запросов · 49 ★</button><button className="ghost" onClick={toggleReminder}>{user?.reminderEnabled?'Выключить карту дня 🔕':'Напоминать о карте дня 🔔'}</button></div>{adminStats&&<section className="admin"><p className="eyebrow">Панель владельца</p><h3>Живая статистика</h3><div className="stats"><div><b>{adminStats.users}</b><span>пользователей</span></div><div><b>{adminStats.readings}</b><span>посланий</span></div><div><b>{adminStats.stars} ★</b><span>выручка</span></div></div></section>}</main>}

    {mode && <div className="sheet"><form onSubmit={submit}><button type="button" className="close" onClick={()=>setMode(null)}>×</button><p className="eyebrow">Личная практика</p><h2>{modes.find(x=>x.id===mode)?.title}</h2>{fields[mode].map(([name,label,type,options])=><label key={name}>{label}{type==='select'?<select value={form[name]||options[0]} onChange={e=>setForm({...form,[name]:e.target.value})}>{options.map(o=><option key={o}>{o}</option>)}</select>:type==='textarea'?<textarea required placeholder={options} value={form[name]||''} onChange={e=>setForm({...form,[name]:e.target.value})}/>:<input required type={type} placeholder={options} value={form[name]||''} onChange={e=>setForm({...form,[name]:e.target.value})}/>}</label>)}<button className="primary" disabled={loading}>{loading?'Собираю символы…':'Получить послание'}</button></form></div>}
    <Result result={result} onClose={()=>{setResult(null);api('/api/me').then(setUser).catch(()=>{});}} />
    <Nav page={page} setPage={setPage}/>
  </div>;
}
