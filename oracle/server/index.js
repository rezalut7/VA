import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { createReading } from "./ai.js";
import { botApi, signSession, startKeyboard, validateInitData, verifySession } from "./telegram.js";
import { consumeRequest, publicUser, query, saveReading, transaction, upsertUser } from "./db.js";

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
app.post("/api/me/reminder",auth,asyncRoute(async(req,res)=>{
  const enabled=Boolean(req.body.enabled);
  await query("UPDATE users SET reminder_enabled=$2 WHERE id=$1",[req.session.userId,enabled]);
  res.json({enabled});
}));

app.get("/api/daily",auth,asyncRoute(async(req,res)=>{
  const existing=await query(`SELECT r.result FROM daily_cards d JOIN readings r ON r.id=d.reading_id
    WHERE d.user_id=$1 AND d.card_date=current_date`,[req.session.userId]);
  if(existing.rowCount) return res.json(existing.rows[0].result);
  await consumeRequest(req.session.userId);
  const result=await createReading("daily",{});
  const saved=await saveReading(req.session.userId,"daily",result.title,{},result);
  await query("INSERT INTO daily_cards(user_id,reading_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.session.userId,saved.id]);
  res.json(result);
}));

const validators={
  oracle:b=>typeof b.question==="string"&&b.question.trim().length>=3&&["общее","любовь","деньги","карьера"].includes(b.sphere),
  tarot:b=>typeof b.question==="string"&&b.question.trim().length>=3&&["1","3","7"].includes(String(b.cards)),
  compatibility:b=>["firstName","firstBirthDate","secondName","secondBirthDate","relationship"].every(k=>String(b[k]||"").trim()),
  dream:b=>typeof b.dream==="string"&&b.dream.trim().length>=10,
};
app.post("/api/readings/:kind",auth,asyncRoute(async(req,res)=>{
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
  res.json(result);
}));

app.get("/api/history",auth,asyncRoute(async(req,res)=>{
  const {rows}=await query(`SELECT id,kind,title,result->>'text' preview,favorite,created_at FROM readings
    WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[req.session.userId]);
  const icons={daily:"✦",oracle:"◐",tarot:"♢",compatibility:"∞",dream:"☾"};
  res.json({items:rows.map(r=>({id:r.id,kind:r.kind,title:r.title,preview:r.preview?.slice(0,180),favorite:r.favorite,createdAt:r.created_at,icon:icons[r.kind]}))});
}));

app.post("/api/history/:id/favorite",auth,asyncRoute(async(req,res)=>{
  const {rows}=await query("UPDATE readings SET favorite=NOT favorite WHERE id=$1 AND user_id=$2 RETURNING favorite",[req.params.id,req.session.userId]);
  if(!rows[0]) return res.status(404).json({error:"not_found"});
  res.json(rows[0]);
}));

const products={
  premium_week:{title:"Premium на 7 дней",description:"Безлимитные практики и расширенные расклады на неделю",stars:config.premiumWeekStars},
  extra_requests:{title:"10 дополнительных запросов",description:"Десять практик сверх дневного лимита",stars:config.extraRequestsStars},
};
app.post("/api/payments/invoice",auth,asyncRoute(async(req,res)=>{
  const product=products[req.body.product];
  if(!product) return res.status(400).json({error:"unknown_product"});
  const payload=`${req.body.product}:${req.session.userId}:${Date.now()}`;
  const invoiceLink=await botApi("createInvoiceLink",{
    title:product.title,description:product.description,payload,currency:"XTR",prices:[{label:product.title,amount:product.stars}],provider_token:"",
  });
  res.json({invoiceLink});
}));

app.get("/api/admin/stats",auth,asyncRoute(async(req,res)=>{
  if(!config.adminIds.has(req.session.telegramId)) return res.status(403).json({error:"forbidden"});
  const {rows}=await query(`SELECT
    (SELECT count(*)::int FROM users) users,
    (SELECT count(*)::int FROM users WHERE created_at>now()-interval '24 hours') new_today,
    (SELECT count(*)::int FROM readings) readings,
    (SELECT coalesce(sum(stars),0)::int FROM payments) stars,
    (SELECT count(*)::int FROM payments) payments`);
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
  if(update.pre_checkout_query) await botApi("answerPreCheckoutQuery",{pre_checkout_query_id:update.pre_checkout_query.id,ok:true});
  const payment=update.message?.successful_payment;
  if(payment?.currency==="XTR") {
    const [product,userId]=payment.invoice_payload.split(":");
    const expected=products[product];
    if(expected && expected.stars===payment.total_amount) await transaction(async client=>{
      const inserted=await client.query(`INSERT INTO payments(user_id,telegram_charge_id,product,stars,payload)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(telegram_charge_id) DO NOTHING RETURNING id`,[userId,payment.telegram_payment_charge_id,product,payment.total_amount,payment.invoice_payload]);
      if(!inserted.rowCount) return;
      if(product==="premium_week") await client.query(`UPDATE users SET premium_until=GREATEST(coalesce(premium_until,now()),now())+interval '7 days' WHERE id=$1`,[userId]);
      if(product==="extra_requests") await client.query("UPDATE users SET bonus_requests=bonus_requests+10 WHERE id=$1",[userId]);
    });
  }
  const message=update.message;
  if(message?.text?.startsWith("/start")) {
    const start=message.text.split(" ")[1]||"";
    const url=start?`${config.publicUrl}?startapp=${encodeURIComponent(start)}`:config.publicUrl;
    const keyboard=startKeyboard(); keyboard.inline_keyboard[0][0].web_app.url=url;
    await botApi("sendMessage",{chat_id:message.chat.id,text:"Я — Мадам Агриппина ✦\n\nЗдесь нет неизбежных пророчеств — только символы, вопросы и новый взгляд на то, что уже живёт внутри вас.",reply_markup:keyboard});
  }
  res.json({ok:true});
}));

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
app.use(express.static(path.join(root,"dist"),{maxAge:"1h"}));
app.get("*",(req,res,next)=>req.path.startsWith("/api/")||req.path.startsWith("/telegram/")?next():res.sendFile(path.join(root,"dist","index.html")));

app.use((error,req,res,next)=>{
  console.error(error.detail||error.message||error);
  res.status(error.status||500).json({error:error.message||"server_error",message:error.status?error.message:"Что-то пошло не так. Попробуйте ещё раз."});
});

app.listen(config.port,()=>console.log(`Madam Agrippina AI listening on :${config.port}`));
