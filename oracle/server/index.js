import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { createReading } from "./ai.js";
import { botApi, signSession, startKeyboard, termsKeyboard, validateInitData, verifySession } from "./telegram.js";
import { acceptTerms, activateReferral, consumeRequest, publicUser, query, redeemPromo, rewardReferralPurchase, saveReading, transaction, upsertUser } from "./db.js";

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.NODE_ENV === "production" ? config.publicUrl : true }));
app.use(express.json({ limit:"128kb" }));

function asyncRoute(fn) { return (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next); }
function auth(req,res,next) {
  const value = req.headers.authorization?.replace(/^Bearer\s+/i,"");
  const session = value && verifySession(value);
  if (!session?.userId) return res.status(401).json({error:"unauthorized",message:"Откройте приложение внутри Telegram"});
  req.session = session; next();
}
async function accepted(req,res,next) {
  const user=await publicUser(req.session.userId);
  if(!user?.termsAccepted) return res.status(403).json({error:"terms_required",message:"Примите условия, чтобы продолжить"});
  req.user=user; next();
}
const protectedRoute=[auth,asyncRoute(accepted)];

async function activateReferralAndNotify(userId) {
  const reward=await activateReferral(userId);
  if(!reward) return;
  const milestone=reward.premiumDays?`\nИ ещё +${reward.premiumDays} ${reward.premiumDays===1?'день':'дня'} Premium за достижение ${reward.active} друзей ✦`:"";
  try { await botApi("sendMessage",{chat_id:reward.telegram_id,text:`🎁 ${reward.referredName} получил первое послание!\n\nВам начислено +3 запроса.${milestone}`,reply_markup:startKeyboard()}); }
  catch(error) { console.error("Referral notification failed",error.message); }
}

app.get("/health",asyncRoute(async(req,res)=>{
  await query("SELECT 1");
  res.json({ok:true,app:"madam-agrippina-ai",bot:config.botUsername,ai:Boolean(config.openaiKey)});
}));

app.post("/api/auth/telegram",asyncRoute(async(req,res)=>{
  const {user,startParam}=validateInitData(String(req.body.initData||""));
  const row=await upsertUser(user,startParam);
  res.json({token:signSession({userId:row.id,telegramId:row.telegram_id}),user:await publicUser(row.id)});
}));

app.post("/api/auth/dev",asyncRoute(async(req,res)=>{
  if(!config.allowDevAuth) return res.status(403).json({error:"dev_auth_disabled",message:"Откройте приложение внутри Telegram"});
  const row=await upsertUser({id:999000001,first_name:"Александр",username:"dev"},null);
  res.json({token:signSession({userId:row.id,telegramId:row.telegram_id}),user:await publicUser(row.id)});
}));

app.get("/api/me",auth,asyncRoute(async(req,res)=>res.json(await publicUser(req.session.userId))));
app.post("/api/me/accept-terms",auth,asyncRoute(async(req,res)=>res.json(await acceptTerms(req.session.userId))));
app.post("/api/promo/redeem",...protectedRoute,asyncRoute(async(req,res)=>res.json(await redeemPromo(req.session.userId,req.body.code))));
app.post("/api/me/reminder",...protectedRoute,asyncRoute(async(req,res)=>{
  const enabled=Boolean(req.body.enabled);
  await query("UPDATE users SET reminder_enabled=$2 WHERE id=$1",[req.session.userId,enabled]);
  res.json({enabled});
}));

app.get("/api/daily",...protectedRoute,asyncRoute(async(req,res)=>{
  const existing=await query(`SELECT r.result FROM daily_cards d JOIN readings r ON r.id=d.reading_id
    WHERE d.user_id=$1 AND d.card_date=current_date`,[req.session.userId]);
  if(existing.rowCount) return res.json(existing.rows[0].result);
  await consumeRequest(req.session.userId);
  const result=await createReading("daily",{});
  const saved=await saveReading(req.session.userId,"daily",result.title,{},result);
  await query("INSERT INTO daily_cards(user_id,reading_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.session.userId,saved.id]);
  await activateReferralAndNotify(req.session.userId);
  res.json(result);
}));

const validators={
  oracle:b=>typeof b.question==="string"&&b.question.trim().length>=3&&["общее","любовь","деньги","карьера"].includes(b.sphere),
  tarot:b=>typeof b.question==="string"&&b.question.trim().length>=3&&["1","3","7"].includes(String(b.cards)),
  compatibility:b=>["firstName","firstBirthDate","secondName","secondBirthDate","relationship"].every(k=>String(b[k]||"").trim()),
  dream:b=>typeof b.dream==="string"&&b.dream.trim().length>=10,
};
app.post("/api/readings/:kind",...protectedRoute,asyncRoute(async(req,res)=>{
  const kind=req.params.kind;
  if(!validators[kind]?.(req.body)) return res.status(400).json({error:"invalid_input",message:"Проверьте заполненные поля"});
  if(kind==="tarot" && ["3","7"].includes(String(req.body.cards))) {
    const current=await publicUser(req.session.userId);
    if(!current?.premiumUntil || new Date(current.premiumUntil)<=new Date()) return res.status(402).json({error:"premium_required",message:"Расклады на 3 и 7 карт доступны в Premium"});
  }
  await consumeRequest(req.session.userId);
  const input=Object.fromEntries(Object.entries(req.body).map(([k,v])=>[k,String(v).trim().slice(0,2500)]));
  const result=await createReading(kind,input);
  await saveReading(req.session.userId,kind,result.title,input,result);
  await activateReferralAndNotify(req.session.userId);
  res.json(result);
}));

app.get("/api/history",...protectedRoute,asyncRoute(async(req,res)=>{
  const {rows}=await query(`SELECT id,kind,title,result->>'text' preview,favorite,created_at FROM readings
    WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[req.session.userId]);
  const icons={daily:"✦",oracle:"◐",tarot:"♢",compatibility:"∞",dream:"☾"};
  res.json({items:rows.map(r=>({id:r.id,kind:r.kind,title:r.title,preview:r.preview?.slice(0,180),favorite:r.favorite,createdAt:r.created_at,icon:icons[r.kind]}))});
}));

app.post("/api/history/:id/favorite",...protectedRoute,asyncRoute(async(req,res)=>{
  const {rows}=await query("UPDATE readings SET favorite=NOT favorite WHERE id=$1 AND user_id=$2 RETURNING favorite",[req.params.id,req.session.userId]);
  if(!rows[0]) return res.status(404).json({error:"not_found"});
  res.json(rows[0]);
}));

const products={
  premium_week:{title:"Premium на 7 дней",description:"Безлимитные практики и расширенные расклады на неделю",stars:config.premiumWeekStars},
  extra_requests:{title:"10 дополнительных запросов",description:"Десять практик сверх дневного лимита",stars:config.extraRequestsStars},
};
app.post("/api/payments/invoice",...protectedRoute,asyncRoute(async(req,res)=>{
  const product=products[req.body.product];
  if(!product) return res.status(400).json({error:"unknown_product"});
  const payload=`${req.body.product}:${req.session.userId}:${Date.now()}`;
  const invoiceLink=await botApi("createInvoiceLink",{
    title:product.title,description:product.description,payload,currency:"XTR",prices:[{label:product.title,amount:product.stars}],provider_token:"",
  });
  res.json({invoiceLink});
}));

app.get("/api/admin/stats",...protectedRoute,asyncRoute(async(req,res)=>{
  if(!config.adminIds.has(req.session.telegramId)) return res.status(403).json({error:"forbidden"});
  const {rows}=await query(`SELECT
    (SELECT count(*)::int FROM users) users,
    (SELECT count(*)::int FROM users WHERE created_at>now()-interval '24 hours') new_today,
    (SELECT count(*)::int FROM readings) readings,
    (SELECT coalesce(sum(stars),0)::int FROM payments) stars,
    (SELECT count(*)::int FROM payments) payments,
    (SELECT count(*)::int FROM promo_redemptions) promo_redemptions`);
  const sources=await query(`SELECT coalesce(acquisition_source,'direct') source,count(*)::int users
    FROM users GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);
  res.json({...rows[0],sources:sources.rows});
}));

app.post("/internal/reminders",asyncRoute(async(req,res)=>{
  if(!config.cronSecret || req.headers.authorization!==`Bearer ${config.cronSecret}`) return res.sendStatus(401);
  const hour=new Date().getUTCHours();
  const {rows}=await query(`SELECT telegram_id,first_name FROM users WHERE reminder_enabled=true
    AND reminder_hour_utc=$1 AND (last_reminder_on IS NULL OR last_reminder_on<current_date) LIMIT 500`,[hour]);
  let sent=0;
  for(const user of rows) {
    try {
      await botApi("sendMessage",{chat_id:user.telegram_id,text:`${user.first_name}, ваша карта дня уже ждёт ✦`,reply_markup:startKeyboard()});
      await query("UPDATE users SET last_reminder_on=current_date WHERE telegram_id=$1",[user.telegram_id]);
      sent++;
    } catch(error) { console.error("Reminder failed",user.telegram_id,error.message); }
  }
  res.json({selected:rows.length,sent});
}));

app.post("/telegram/webhook",asyncRoute(async(req,res)=>{
  if(config.webhookSecret && req.headers["x-telegram-bot-api-secret-token"]!==config.webhookSecret) return res.sendStatus(401);
  const update=req.body;
  const callback=update.callback_query;
  if(callback?.data==="accept_terms_v1") {
    const user=await upsertUser(callback.from,null);
    const acceptedUser=await acceptTerms(user.id);
    await botApi("answerCallbackQuery",{callback_query_id:callback.id,text:"Готово — условия приняты ✨"});
    const name=String(callback.from.first_name||"Путник").replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));
    const caption=`✨ <b>${name}, добро пожаловать.</b>\n\nМадам Агриппина готова открыть для вас символы, которые помогут взглянуть на ситуацию иначе.\n\nВас уже ждут <b>${acceptedUser.requestsLeft} бесплатных запросов</b>, карта дня, Таро, совместимость и толкование снов.\n\nНажмите кнопку ниже — начнём.`;
    if(callback.message?.photo) await botApi("editMessageCaption",{chat_id:callback.message.chat.id,message_id:callback.message.message_id,caption,parse_mode:"HTML",reply_markup:startKeyboard()});
    else await botApi("sendMessage",{chat_id:callback.message.chat.id,text:caption,parse_mode:"HTML",reply_markup:startKeyboard()});
  }
  if(update.pre_checkout_query) await botApi("answerPreCheckoutQuery",{pre_checkout_query_id:update.pre_checkout_query.id,ok:true});
  const payment=update.message?.successful_payment;
  if(payment?.currency==="XTR") {
    const [product,userId]=payment.invoice_payload.split(":");
    const expected=products[product];
    if(expected && expected.stars===payment.total_amount) {
      const applied=await transaction(async client=>{
      const inserted=await client.query(`INSERT INTO payments(user_id,telegram_charge_id,product,stars,payload)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(telegram_charge_id) DO NOTHING RETURNING id`,[userId,payment.telegram_payment_charge_id,product,payment.total_amount,payment.invoice_payload]);
      if(!inserted.rowCount) return false;
      if(product==="premium_week") await client.query(`UPDATE users SET premium_until=GREATEST(coalesce(premium_until,now()),now())+interval '7 days' WHERE id=$1`,[userId]);
      if(product==="extra_requests") await client.query("UPDATE users SET bonus_requests=bonus_requests+10 WHERE id=$1",[userId]);
      return true;
    });
      if(applied&&product==="premium_week") {
        const reward=await rewardReferralPurchase(userId);
        if(reward) try { await botApi("sendMessage",{chat_id:reward.telegram_id,text:"💜 Ваш друг подключил Premium. Вам начислен 1 день Premium — спасибо, что помогаете Агриппине расти!",reply_markup:startKeyboard()}); } catch(error) { console.error("Referral purchase notification failed",error.message); }
      }
    }
  }
  const message=update.message;
  if(message?.text?.startsWith("/start")) {
    const start=message.text.split(" ")[1]||"";
    const url=start?`${config.publicUrl}?startapp=${encodeURIComponent(start)}`:config.publicUrl;
    const user=await upsertUser(message.from,start);
    if(user.terms_accepted_at) {
      await botApi("sendPhoto",{chat_id:message.chat.id,photo:`${config.publicUrl}/assets/madam-agrippina-avatar.png`,caption:"✦ <b>Мадам Агриппина ждёт вас.</b>\n\nКарта дня, Таро, совместимость и толкование снов — в одном мистическом пространстве.",parse_mode:"HTML",reply_markup:startKeyboard(url)});
    } else {
      const referralGift=start.startsWith("ref_")?"\n\n🎁 <b>Подарок по приглашению:</b> после согласия вам начислят +2 бесплатных запроса.":"";
      const caption=`🔮 <b>Мадам Агриппина AI</b>\n\nДобро пожаловать туда, где символы помогают услышать себя.\n\n✦ Персональная карта дня\n♢ Расклады Таро\n∞ Совместимость пары\n☾ Толкование снов\n◐ Ответы Оракула${referralGift}\n\n<b>Перед началом</b> подтвердите согласие с условиями. Сервис предназначен для развлечения и саморефлексии, не заменяет медицинские, юридические или финансовые рекомендации. 18+`;
      await botApi("sendPhoto",{chat_id:message.chat.id,photo:`${config.publicUrl}/assets/madam-agrippina-avatar.png`,caption,parse_mode:"HTML",reply_markup:termsKeyboard()});
    }
  }
  res.json({ok:true});
}));

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
app.use(express.static(path.join(root,"dist"),{maxAge:"1h",setHeaders:(res,filePath)=>{
  if(filePath.endsWith("index.html")) res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
}}));
app.get("/terms",(req,res)=>res.sendFile(path.join(root,"dist","terms.html")));
app.get("*",(req,res,next)=>{
  if(req.path.startsWith("/api/")||req.path.startsWith("/telegram/")) return next();
  res.setHeader("Cache-Control","no-store, no-cache, must-revalidate");
  res.sendFile(path.join(root,"dist","index.html"));
});

app.use((error,req,res,next)=>{
  console.error(error.detail||error.message||error);
  res.status(error.status||500).json({error:error.message||"server_error",message:error.status?error.message:"Что-то пошло не так. Попробуйте ещё раз."});
});

app.listen(config.port,()=>console.log(`Madam Agrippina AI listening on :${config.port}`));
