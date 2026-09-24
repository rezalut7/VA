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

function Result({ result, onClose, onInvite, onShare, onStory, onDownload, storyAssets }) {
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
    <section className="story-share">
      <div className="story-share-title"><span>✦</span><div><b>Ваша карточка готова</b><small>Формат 9:16 для Telegram, Instagram и VK Stories</small></div></div>
      {storyAssets?<img src={storyAssets.storyUrl} alt="Карточка послания для Stories"/>:<div className="story-skeleton">Создаю магию…</div>}
      <button className="story-primary" disabled={!storyAssets} onClick={onStory}>Выложить в Telegram Stories</button>
      <div className="story-actions"><button disabled={!storyAssets} onClick={onDownload}>Скачать карточку</button><button onClick={onShare}>Отправить в чат</button></div>
    </section>
    <button className="result-referral" onClick={onInvite}>Подарить другу +2 запроса</button>
    <small className="reward-hint">После его первого послания вы получите +3 запроса</small>
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
  const [promoCode, setPromoCode] = useState("");
  const [promoMessage, setPromoMessage] = useState("");
  const [storyAssets, setStoryAssets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const greeting = useMemo(()=>new Date().getHours()<12?'Доброе утро':new Date().getHours()<18?'Добрый день':'Добрый вечер',[]);

  useEffect(()=>{ authenticate().then(setUser).catch(e=>setError(e.message)).finally(()=>setLoading(false)); },[]);
  useEffect(()=>{ if(page==='history') api('/api/history').then(r=>setHistory(r.items)).catch(e=>setError(e.message)); if(page==='profile'&&user?.isAdmin) api('/api/admin/stats').then(setAdminStats).catch(()=>{}); },[page,user?.isAdmin]);
  useEffect(()=>{
    setStoryAssets(null);
    if(!result?.readingId) return;
    api(`/api/readings/${result.readingId}/share-card`,{method:'POST'}).then(setStoryAssets).catch(()=>{});
  },[result?.readingId]);

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

  async function acceptConditions(){
    setLoading(true); setError("");
    try { setUser(await api('/api/me/accept-terms',{method:'POST'})); }
    catch(e){ setError(e.message); }
    finally { setLoading(false); }
  }

  const referralLink=user?.referralCode?`https://t.me/madam_agrippina_bot?start=ref_${user.referralCode}`:"";
  const activeReferrals=Number(user?.activeReferrals||0);
  const nextMilestone=[3,5,10].find(value=>activeReferrals<value);
  const milestoneReward=nextMilestone===3?"1 день Premium":nextMilestone===5?"3 дня Premium":nextMilestone===10?"7 дней Premium":"Все награды получены";
  const referralProgress=nextMilestone?Math.min(100,activeReferrals/nextMilestone*100):100;

  function inviteFriend(){
    share("Я нашёл(ла) Мадам Агриппину — здесь можно получить карту дня, спросить Оракула, сделать расклад Таро и разобрать сон. По моей ссылке тебе подарят +2 бесплатных запроса ✦",referralLink);
  }

  function shareResult(){
    share(`${result.title}\n\n${result.text}\n\nПолучить своё послание:`,referralLink);
  }

  function shareStory(){
    if(!storyAssets) return;
    const tg=window.Telegram?.WebApp;
    if(!tg?.shareToStory) return setError("Обновите Telegram, чтобы публиковать карточки в Stories");
    try {
      tg.shareToStory(storyAssets.storyUrl,{text:"Моё послание от Мадам Агриппины ✦",widget_link:{url:referralLink,name:"Получить своё послание"}});
    } catch(e) {
      try { tg.shareToStory(storyAssets.storyUrl,{text:"Моё послание от Мадам Агриппины ✦"}); }
      catch { setError("Не удалось открыть редактор Stories. Попробуйте скачать карточку."); }
    }
  }

  function downloadStory(){
    if(!storyAssets) return;
    const tg=window.Telegram?.WebApp;
    if(tg?.downloadFile) tg.downloadFile({url:storyAssets.downloadUrl,file_name:`agrippina-${result.readingId}.png`});
    else window.open(storyAssets.downloadUrl,"_blank","noopener,noreferrer");
  }

  async function redeemPromo(e){
    e.preventDefault();
    if(!promoCode.trim()) return;
    setPromoMessage(""); setError("");
    try {
      const updated=await api('/api/promo/redeem',{method:'POST',body:JSON.stringify({code:promoCode})});
      setUser(updated); setPromoCode(""); setPromoMessage("Premium активирован на 7 дней ✦");
    } catch(e) { setError(e.message); }
  }

  if (loading && !user) return <main className="splash"><img className="brand-portrait" src="/assets/madam-agrippina-avatar.webp" alt="Мадам Агриппина"/><h1>Мадам Агриппина</h1><p>Слушаю тишину между звёздами…</p></main>;

  if(!user) return <main className="splash consent-screen"><img className="brand-portrait" src="/assets/madam-agrippina-avatar.webp" alt="Мадам Агриппина"/><p className="eyebrow">Нужен Telegram</p><h1>Откройте Агриппину в боте</h1><p>{error||'Не удалось подтвердить запуск Mini App.'}</p><button className="primary" onClick={()=>location.reload()}>Попробовать снова ✦</button></main>;

  if(!user.termsAccepted) return <main className="splash consent-screen"><img className="brand-portrait" src="/assets/madam-agrippina-avatar.webp" alt="Мадам Агриппина"/><p className="eyebrow">Первое знакомство</p><h1>Добро пожаловать</h1><p>Нажимая кнопку ниже, вы соглашаетесь с условиями сервиса. Мадам Агриппина использует символы и образы для развлечения и саморефлексии. Сервис 18+.</p>{error&&<div className="consent-error">{error}</div>}<button className="primary consent-accept" disabled={loading} onClick={acceptConditions}>{loading?'Принимаю условия…':'Принять условия и продолжить ✦'}</button><a className="terms-link" href="/terms" target="_blank" rel="noreferrer">Прочитать условия и политику конфиденциальности</a><small>Сервис не заменяет медицинские, юридические или финансовые рекомендации.</small></main>;

  return <div className="app">
    <header><div><p className="eyebrow">{greeting}</p><h1>{user?.firstName || 'Путник'}</h1></div><div className="streak">🔥 {user?.streak || 1}</div></header>
    {error && <div className="error" onClick={()=>setError('')}>{error}</div>}

    {page==='home' && <main>
      <section className="hero"><div className="hero-card"><img src="/assets/tarot-card-back.webp" alt="Мистическая карта"/></div><p className="eyebrow">Сегодня · {new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}</p><h2>Ответ уже рядом</h2><p>Выберите практику, чтобы взглянуть на ситуацию с новой стороны.</p><button className="primary" onClick={()=>openMode('daily')}>Открыть карту дня</button></section>
      <div className="balance"><span>Бесплатных запросов сегодня</span><b>{user?.requestsLeft ?? 3}</b></div>
      <section className="mode-grid">{modes.slice(1).map(item=><button className="mode" key={item.id} onClick={()=>openMode(item.id)}><i>{item.icon}</i><span><b>{item.title}</b><small>{item.subtitle}</small></span><em>›</em></button>)}</section>
      <section className="premium premium-month"><span>✧</span><div><p className="eyebrow">Premium на месяц · выгоднее</p><h3>Вся глубина Агриппины без лимитов</h3><small>399 ★ каждые 30 дней · можно отменить в Telegram</small></div><button onClick={()=>buy('premium_month')}>399 ★</button></section>
      <button className="week-offer" onClick={()=>buy('premium_week')}>Попробовать Premium на 7 дней · 149 ★</button>
      <p className="disclaimer">Сервис создан для развлечения и саморефлексии. Он не заменяет профессиональные медицинские, юридические или финансовые рекомендации.</p>
    </main>}

    {page==='history' && <main><div className="section-title"><p className="eyebrow">Ваш путь</p><h2>История посланий</h2></div>{history.length?history.map(item=><article className="history" key={item.id}><span>{item.icon || '✦'}</span><div><b>{item.title}</b><p>{item.preview}</p><small>{new Date(item.createdAt).toLocaleDateString('ru-RU')}</small></div><button className={item.favorite?'fav active':'fav'} onClick={()=>favorite(item.id)}>♥</button></article>):<div className="empty">Здесь появятся ваши расклады и толкования.</div>}</main>}

    {page==='profile' && <main>
      <div className="profile-card">
        <div className="avatar"><img src="/assets/madam-agrippina-avatar.webp" alt="Мадам Агриппина"/></div>
        <h2>{user?.firstName||'Путник'}</h2>
        <p>{user?.premiumUntil && new Date(user.premiumUntil)>new Date() ? `Premium до ${new Date(user.premiumUntil).toLocaleDateString('ru-RU')}`:'Базовый доступ'}</p>
        <div className="stats"><div><b>{user?.totalReadings||0}</b><span>посланий</span></div><div><b>{activeReferrals}</b><span>активных друзей</span></div><div><b>{user?.streak||1}</b><span>дней подряд</span></div></div>
        <button className="primary" onClick={()=>buy('premium_month')}>Premium на месяц · 399 ★</button>
        <button className="ghost" onClick={()=>buy('extra_requests')}>Купить 10 запросов · 49 ★</button>
        <button className="ghost" onClick={toggleReminder}>{user?.reminderEnabled?'Выключить карту дня 🔕':'Напоминать о карте дня 🔔'}</button>
      </div>

      <section className="referral-card">
        <div className="referral-glow">∞</div>
        <p className="eyebrow">Круг Агриппины</p>
        <h2>Дарите магию — получайте Premium</h2>
        <p>Друг получит <b>+2 запроса</b>. После его первого послания вам начислят <b>+3 запроса</b>.</p>
        <div className="referral-progress-head"><span>{activeReferrals} активных друзей</span><b>{nextMilestone?`${nextMilestone-activeReferrals} до награды`:'Высший круг ✦'}</b></div>
        <div className="referral-progress"><i style={{width:`${referralProgress}%`}}/></div>
        <div className="milestones">
          {[[3,'+1 день'],[5,'+3 дня'],[10,'+7 дней']].map(([count,reward])=><div className={activeReferrals>=count?'reached':''} key={count}><b>{count}</b><span>{reward}<br/>Premium</span></div>)}
        </div>
        <div className="next-reward">Следующая награда: <b>{milestoneReward}</b></div>
        <button className="primary referral-cta" onClick={inviteFriend}>Пригласить друга и получить подарок</button>
        <small>Если друг впервые купит Premium, вы дополнительно получите +1 день.</small>
      </section>

      <section className="promo-card">
        <p className="eyebrow">Секретный знак</p>
        <h3>Есть промокод?</h3>
        <p>Введите его здесь — подарок активируется сразу.</p>
        <form onSubmit={redeemPromo}><input value={promoCode} onChange={e=>setPromoCode(e.target.value.toUpperCase())} placeholder="Введите промокод" maxLength="32"/><button disabled={!promoCode.trim()}>Активировать</button></form>
        {promoMessage&&<div className="promo-success">{promoMessage}</div>}
      </section>

      {adminStats&&<section className="admin"><p className="eyebrow">Панель владельца</p><h3>Живая статистика</h3><div className="stats"><div><b>{adminStats.users}</b><span>пользователей</span></div><div><b>{adminStats.readings}</b><span>посланий</span></div><div><b>{adminStats.stars} ★</b><span>выручка</span></div><div><b>{adminStats.promo_redemptions||0}</b><span>промокодов</span></div></div></section>}
    </main>}

    {mode && <div className="sheet"><form onSubmit={submit}><button type="button" className="close" onClick={()=>setMode(null)}>×</button><p className="eyebrow">Личная практика</p><h2>{modes.find(x=>x.id===mode)?.title}</h2>{fields[mode].map(([name,label,type,options])=><label key={name}>{label}{type==='select'?<select value={form[name]||options[0]} onChange={e=>setForm({...form,[name]:e.target.value})}>{options.map(o=><option key={o}>{o}</option>)}</select>:type==='textarea'?<textarea required placeholder={options} value={form[name]||''} onChange={e=>setForm({...form,[name]:e.target.value})}/>:<input required type={type} placeholder={options} value={form[name]||''} onChange={e=>setForm({...form,[name]:e.target.value})}/>}</label>)}<button className="primary" disabled={loading}>{loading?'Собираю символы…':'Получить послание'}</button></form></div>}
    <Result result={result} storyAssets={storyAssets} onShare={shareResult} onStory={shareStory} onDownload={downloadStory} onInvite={inviteFriend} onClose={()=>{setResult(null);api('/api/me').then(setUser).catch(()=>{});}} />
    <Nav page={page} setPage={setPage}/>
  </div>;
}
