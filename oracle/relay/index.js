import crypto from "node:crypto";
import http from "node:http";

const port = Number(process.env.PORT || 10000);
const token = process.env.TELEGRAM_BOT_TOKEN || "";
const relaySecret = process.env.RELAY_SECRET || "";
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const originWebhookUrl = process.env.ORIGIN_WEBHOOK_URL || "";
const miniAppUrl = process.env.MINI_APP_URL || "";
const publicUrl = (process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || "").replace(/\/$/, "");
const allowedMethods = new Set(["answerPreCheckoutQuery", "createInvoiceLink", "sendMessage"]);
let setupState = "pending";

function safeEqual(a,b) {
  const left=Buffer.from(String(a||""));
  const right=Buffer.from(String(b||""));
  return left.length===right.length && crypto.timingSafeEqual(left,right);
}

async function readJson(req) {
  const chunks=[];
  let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if(size>262144) throw Object.assign(new Error("payload_too_large"),{status:413});
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
}

async function telegram(method,payload) {
  if(!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),
  });
  const text=await response.text();
  return {status:response.status,text,contentType:response.headers.get("content-type")||"application/json"};
}

function send(res,status,body,contentType="application/json") {
  res.writeHead(status,{"content-type":`${contentType}; charset=utf-8`,"cache-control":"no-store"});
  res.end(body);
}

async function setupTelegram() {
  if(!token||!webhookSecret||!originWebhookUrl||!miniAppUrl||!publicUrl) {
    setupState="missing_config";
    return;
  }
  const webhook=await telegram("setWebhook",{url:`${publicUrl}/telegram/webhook`,secret_token:webhookSecret,allowed_updates:["message","pre_checkout_query"]});
  if(webhook.status>=400) throw new Error(`setWebhook failed: ${webhook.status}`);
  const menu=await telegram("setChatMenuButton",{menu_button:{type:"web_app",text:"Открыть Агриппину ✦",web_app:{url:miniAppUrl}}});
  if(menu.status>=400) throw new Error(`setChatMenuButton failed: ${menu.status}`);
  await telegram("setMyCommands",{commands:[{command:"start",description:"Открыть Мадам Агриппину"}]});
  setupState="ready";
}

const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,"http://relay.local");
    if(req.method==="GET"&&url.pathname==="/health") return send(res,200,JSON.stringify({ok:true,setup:setupState}));

    if(req.method==="POST"&&url.pathname.startsWith("/api/")) {
      if(!relaySecret||!safeEqual(req.headers["x-relay-secret"],relaySecret)) return send(res,401,JSON.stringify({ok:false,error:"unauthorized"}));
      const method=url.pathname.slice(5);
      if(!allowedMethods.has(method)) return send(res,403,JSON.stringify({ok:false,error:"method_not_allowed"}));
      const result=await telegram(method,await readJson(req));
      return send(res,result.status,result.text,result.contentType);
    }

    if(req.method==="POST"&&url.pathname==="/telegram/webhook") {
      if(!webhookSecret||!safeEqual(req.headers["x-telegram-bot-api-secret-token"],webhookSecret)) return send(res,401,JSON.stringify({ok:false}));
      const update=await readJson(req);
      const response=await fetch(originWebhookUrl,{method:"POST",headers:{"content-type":"application/json","x-telegram-bot-api-secret-token":webhookSecret},body:JSON.stringify(update)});
      if(!response.ok) throw new Error(`origin webhook failed: ${response.status}`);
      return send(res,200,JSON.stringify({ok:true}));
    }
    send(res,404,JSON.stringify({ok:false,error:"not_found"}));
  } catch(error) {
    console.error(error.message);
    send(res,error.status||500,JSON.stringify({ok:false,error:"relay_error"}));
  }
});

server.listen(port,"0.0.0.0",()=>{
  console.log(`Telegram relay listening on :${port}`);
  setupTelegram().catch(error=>{setupState="error";console.error(error.message);});
});
