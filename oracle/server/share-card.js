import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { config } from "./config.js";

const serverDir=path.dirname(fileURLToPath(import.meta.url));
let portraitData;

async function loadPortrait() {
  const candidates=[
    path.resolve(serverDir,"../dist/assets/madam-agrippina-avatar.png"),
    path.resolve(serverDir,"../public/assets/madam-agrippina-avatar.png")
  ];
  for(const candidate of candidates) {
    try { return await readFile(candidate); }
    catch(error) { if(error?.code!=="ENOENT") throw error; }
  }
  throw new Error("Madam Agrippina portrait asset was not found");
}

function escapeXml(value="") {
  return String(value).replace(/[<>&"']/g,char=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"}[char]));
}

function wrap(value,maxChars,maxLines) {
  const words=String(value||"").replace(/\s+/g," ").trim().split(" ").filter(Boolean);
  const lines=[];
  let line="";
  for(const word of words) {
    const candidate=line?`${line} ${word}`:word;
    if(candidate.length<=maxChars) line=candidate;
    else {
      if(line) lines.push(line);
      line=word.length>maxChars?`${word.slice(0,maxChars-1)}…`:word;
      if(lines.length===maxLines-1) break;
    }
  }
  if(line&&lines.length<maxLines) lines.push(line);
  const consumed=lines.join(" ").replace(/…$/," ").trim().length;
  if(lines.length===maxLines&&String(value||"").replace(/\s+/g," ").trim().length>consumed) lines[maxLines-1]=`${lines[maxLines-1].replace(/[.,;:!?…]*$/,"")}…`;
  return lines;
}

function textLines(lines,x,y,lineHeight,attributes="") {
  return lines.map((line,index)=>`<text x="${x}" y="${y+index*lineHeight}" ${attributes}>${escapeXml(line)}</text>`).join("");
}

export function signShareCard(readingId) {
  return crypto.createHmac("sha256",config.sessionSecret).update(`story:${readingId}`).digest("hex").slice(0,32);
}

export function verifyShareCard(readingId,signature) {
  const expected=signShareCard(readingId);
  const actual=String(signature||"");
  return actual.length===expected.length&&crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected));
}

export async function renderShareCard(reading) {
  if(!portraitData) {
    const image=await loadPortrait();
    portraitData=image.toString("base64");
  }
  const labels={daily:"КАРТА ДНЯ",oracle:"ОТВЕТ ОРАКУЛА",tarot:"РАСКЛАД ТАРО",compatibility:"СОВМЕСТИМОСТЬ",dream:"ТОЛКОВАНИЕ СНА"};
  const result=reading.result||{};
  const title=wrap(reading.title||result.title||"Послание для вас",24,3);
  const body=wrap([result.verdict,result.text].filter(Boolean).join(" ")||"Ответ уже рядом. Прислушайтесь к тому, что отзывается внутри.",39,10);
  const reflection=wrap(result.reflection||"Сохраните это послание и вернитесь к нему позже.",44,3);
  const cards=Array.isArray(result.cards)?result.cards.slice(0,3):[];
  const cardRow=cards.length?cards.map((card,index)=>{
    const x=110+index*290;
    return `<g transform="translate(${x} 1255)"><rect width="250" height="176" rx="24" fill="#21142f" stroke="#c99b55" stroke-width="2"/><path d="M125 32 L147 66 L125 100 L103 66 Z" fill="none" stroke="#e5c17a" stroke-width="3"/><text x="125" y="135" text-anchor="middle" fill="#f4e6d4" font-size="25" font-family="DejaVu Sans">${escapeXml(String(card).slice(0,18))}</text></g>`;
  }).join(""):result.score?`<g transform="translate(340 1230)"><circle cx="200" cy="110" r="105" fill="#21142f" stroke="#c99b55" stroke-width="3"/><text x="200" y="135" text-anchor="middle" fill="#efd18d" font-size="78" font-family="DejaVu Serif" font-weight="700">${escapeXml(result.score)}%</text></g>`:`<g opacity=".8"><path d="M540 1260 L590 1335 L540 1410 L490 1335 Z" fill="none" stroke="#d5ad68" stroke-width="4"/><circle cx="540" cy="1335" r="120" fill="none" stroke="#8a5fa0" stroke-width="2"/></g>`;
  const svg=`<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="20%" r="90%"><stop offset="0" stop-color="#4a2859"/><stop offset=".48" stop-color="#1a1028"/><stop offset="1" stop-color="#090612"/></radialGradient>
      <linearGradient id="gold" x1="0" x2="1"><stop stop-color="#f0d28f"/><stop offset="1" stop-color="#b77b3f"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="24"/></filter>
      <clipPath id="portrait"><circle cx="540" cy="220" r="104"/></clipPath>
    </defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <circle cx="540" cy="245" r="290" fill="#bd77cf" opacity=".13" filter="url(#glow)"/>
    <g opacity=".16" fill="none" stroke="#d6b06c" stroke-width="2"><circle cx="80" cy="120" r="5"/><circle cx="980" cy="330" r="7"/><circle cx="120" cy="980" r="4"/><circle cx="940" cy="1020" r="5"/><path d="M40 600 Q230 450 410 610 T800 600 T1080 610"/><path d="M0 1500 Q180 1380 360 1510 T720 1500 T1080 1510"/></g>
    <rect x="45" y="45" width="990" height="1830" rx="54" fill="none" stroke="url(#gold)" stroke-width="2" opacity=".72"/>
    <circle cx="540" cy="220" r="116" fill="#120b1c" stroke="#d9b86e" stroke-width="4"/>
    <image href="data:image/png;base64,${portraitData}" x="436" y="116" width="208" height="208" preserveAspectRatio="xMidYMid slice" clip-path="url(#portrait)"/>
    <text x="540" y="385" text-anchor="middle" fill="#d8b66f" font-size="24" letter-spacing="7" font-family="DejaVu Sans">МАДАМ АГРИППИНА</text>
    <text x="540" y="438" text-anchor="middle" fill="#a695ad" font-size="21" letter-spacing="4" font-family="DejaVu Sans">${escapeXml(labels[reading.kind]||"ЛИЧНОЕ ПОСЛАНИЕ")}</text>
    <text x="540" y="490" text-anchor="middle" fill="#8c7c96" font-size="20" font-family="DejaVu Sans">${escapeXml(reading.first_name?`Личное послание · ${reading.first_name}`:"Личное послание для вас")}</text>
    ${textLines(title,540,590,74,'text-anchor="middle" fill="#fff5e7" font-size="62" font-family="DejaVu Serif" font-weight="700"')}
    <path d="M240 805 H840" stroke="url(#gold)" stroke-width="2" opacity=".65"/><circle cx="540" cy="805" r="8" fill="#e3bd73"/>
    ${textLines(body,110,885,54,'fill="#eee2ef" font-size="36" font-family="DejaVu Sans"')}
    ${cardRow}
    <rect x="90" y="1490" width="900" height="170" rx="34" fill="#23152f" stroke="#795b86" stroke-width="2"/>
    <text x="130" y="1540" fill="#d7b874" font-size="22" letter-spacing="3" font-family="DejaVu Sans">ВОПРОС ДЛЯ РАЗМЫШЛЕНИЯ</text>
    ${textLines(reflection,130,1590,38,'fill="#cbbbd0" font-size="27" font-family="DejaVu Sans" font-style="italic"')}
    <rect x="170" y="1720" width="740" height="82" rx="41" fill="url(#gold)"/>
    <text x="540" y="1773" text-anchor="middle" fill="#241326" font-size="29" font-family="DejaVu Sans" font-weight="700">ПОЛУЧИТЬ СВОЁ ПОСЛАНИЕ ✦</text>
    <text x="540" y="1840" text-anchor="middle" fill="#8f8198" font-size="20" font-family="DejaVu Sans">@madam_agrippina_bot · 18+ · для развлечения и саморефлексии</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png({quality:95,compressionLevel:8}).toBuffer();
}
