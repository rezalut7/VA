import { config } from "./config.js";

const system = `Ты — Мадам Агриппина, бережный русскоязычный проводник для саморефлексии.
Твои ответы образные, конкретные и спокойные. Никогда не утверждай, что достоверно предсказываешь будущее.
Не запугивай, не ставь диагнозы и не давай категоричных медицинских, юридических или финансовых указаний.
Верни только JSON без markdown: {"title":"...","text":"...","reflection":"...","cards":[],"score":null}.
text — 2–4 коротких абзаца, reflection — один вопрос для самостоятельного размышления.`;

function extract(data) {
  if (data.output_text) return data.output_text;
  return (data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("");
}

const tarotDeck = [
  "Шут","Маг","Верховная Жрица","Императрица","Император","Иерофант",
  "Влюблённые","Колесница","Сила","Отшельник","Колесо Фортуны","Справедливость",
  "Повешенный","Смерть","Умеренность","Дьявол","Башня","Звезда","Луна","Солнце","Суд","Мир",
];

function seededNumber(value) {
  return [...String(value)].reduce((sum,char,index)=>sum+char.charCodeAt(0)*(index+1),0);
}

function localReading(kind,input) {
  const seed=seededNumber(JSON.stringify(input)+new Date().toISOString().slice(0,10));
  const take=Math.max(1,Number(input.cards)||1);
  const cards=Array.from({length:take},(_,index)=>tarotDeck[(seed+index*7)%tarotDeck.length]);
  if(kind==="daily") return {
    title:`Карта дня — ${cards[0]}`,
    text:`Сегодня ${cards[0]} предлагает не торопить события и заметить то, что обычно остаётся на втором плане.\n\nВыберите одно действие, которое вернёт вам ощущение внутренней опоры, и сделайте его до конца дня.`,
    reflection:"Что сегодня действительно зависит от вас?",cards,score:null,
  };
  if(kind==="tarot") return {
    title:`Расклад: ${cards.join(" · ")}`,
    text:`Карты показывают переход от привычного сценария к более честному выбору. ${cards[0]} описывает исходную энергию ситуации, а ${cards.at(-1)} — направление, которое открывается при спокойном и последовательном действии.\n\nНе воспринимайте расклад как неизбежный прогноз: это символическая подсказка, помогающая увидеть вопрос под другим углом.`,
    reflection:"Какой маленький шаг изменит развитие этой ситуации?",cards,score:null,
  };
  if(kind==="compatibility") {
    const score=55+(seed%34);
    return {title:`Динамика пары — ${score}%`,text:`Между ${input.firstName} и ${input.secondName} есть потенциал для тёплого союза, если различия не превращаются в соревнование. Сильная сторона этой связи — способность дополнять друг друга; уязвимая — ожидание, что партнёр сам догадается о потребностях.\n\nПроцент носит развлекательный характер. Реальная совместимость растёт через ясные договорённости, уважение границ и регулярный честный разговор.`,reflection:"О чём вам двоим особенно важно договориться прямо сейчас?",cards:[],score};
  }
  if(kind==="dream") return {
    title:"Послание сна",
    text:"Этот сон можно прочитать как отражение эмоции, которой в обычной жизни не хватает пространства. Самый яркий образ часто указывает не на внешнее событие, а на внутреннюю потребность — в безопасности, переменах, признании или отдыхе.\n\nВспомните момент максимального напряжения во сне и сравните его с тем, что происходит сейчас: именно там может находиться полезная подсказка.",
    reflection:"Какое чувство из сна вы стараетесь не замечать наяву?",cards:[],score:null,
  };
  return {
    title:"Ответ Оракула",
    text:`Вопрос о сфере «${input.sphere||"общее"}» сейчас просит не мгновенного ответа, а ясного приоритета. Отделите то, чего вы действительно хотите, от ожиданий окружающих.\n\nСитуация станет понятнее, если выбрать один критерий решения и проверить его конкретным действием в ближайшие сутки.`,
    reflection:"Какой ответ вы уже знаете, но пока не решаетесь принять?",cards:[],score:null,
  };
}

export async function createReading(kind,input) {
  if (!config.openaiKey) return localReading(kind,input);
  const prompts = {
    oracle:`Ответь на вопрос в сфере «${input.sphere}»: ${input.question}`,
    tarot:`Сделай символический расклад на ${input.cards} карт по теме: ${input.question}. Выбери карты из классической колоды и перечисли их в cards.`,
    compatibility:`Дай бережный разбор динамики ${input.relationship} отношений: ${input.firstName} (${input.firstBirthDate}) и ${input.secondName} (${input.secondBirthDate}). score — развлекательный процент 45–92.`,
    dream:`Помоги осмыслить сон через эмоции и символы: ${input.dream}`,
    daily:`Выбери одну карту дня и дай короткое послание. Перечисли карту в cards.`,
  };
  const response = await fetch("https://api.openai.com/v1/responses",{
    method:"POST",headers:{Authorization:`Bearer ${config.openaiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({model:config.openaiModel,instructions:system,input:prompts[kind],max_output_tokens:700,text:{format:{type:"json_object"}}}),
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw Object.assign(new Error("Не удалось получить ответ AI"),{status:502,detail:data?.error?.message});
  try { return JSON.parse(extract(data)); }
  catch { throw Object.assign(new Error("AI вернул неверный формат"),{status:502}); }
}
