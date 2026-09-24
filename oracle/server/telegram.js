import crypto from "node:crypto";
import { config } from "./config.js";

export function validateInitData(initData) {
  if (!config.botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw Object.assign(new Error("missing_hash"), { status:401 });
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(config.botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(hash,"hex"),Buffer.from(expected,"hex"))) {
    throw Object.assign(new Error("invalid_signature"), { status:401 });
  }
  const authDate = Number(params.get("auth_date") || 0);
  if (Date.now()/1000-authDate > 86400) throw Object.assign(new Error("init_data_expired"),{status:401});
  const user = JSON.parse(params.get("user") || "null");
  if (!user?.id) throw Object.assign(new Error("missing_user"),{status:401});
  return { user, startParam:params.get("start_param") || "" };
}

export function signSession(payload) {
  const body = Buffer.from(JSON.stringify({...payload,exp:Date.now()+7*86400000})).toString("base64url");
  const signature = crypto.createHmac("sha256",config.sessionSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySession(value) {
  try {
    const [body,signature] = value.split(".");
    const expected = crypto.createHmac("sha256",config.sessionSecret).update(body).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body,"base64url").toString());
    return payload.exp>Date.now()?payload:null;
  } catch { return null; }
}

export async function botApi(method, payload) {
  if (!config.botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const relayed = Boolean(config.telegramRelayUrl && config.telegramRelaySecret);
  const url = relayed ? `${config.telegramRelayUrl}/api/${method}` : `https://api.telegram.org/bot${config.botToken}/${method}`;
  const headers = {"Content-Type":"application/json"};
  if (relayed) headers["x-relay-secret"] = config.telegramRelaySecret;
  const response = await fetch(url,{
    method:"POST",headers,body:JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || response.status}`);
  return data.result;
}

export function startKeyboard(url = config.publicUrl) {
  return { inline_keyboard:[[{
    text:"Открыть Мадам Агриппину ✦",
    web_app:{url},
  }]]};
}

export function termsKeyboard() {
  return { inline_keyboard:[
    [{text:"✅ Согласен с условиями",callback_data:"accept_terms_v1"}],
    [{text:"Условия и конфиденциальность",url:`${config.publicUrl}/terms`}],
  ]};
}
