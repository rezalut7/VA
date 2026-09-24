import { config } from "./config.js";

const system = `Ты — Мадам Агриппина, харизматичная русскоязычная гадалка старой школы и тонкий психологический наблюдатель.
Ты говоришь тепло, уверенно и образно: будто видишь нити ситуации, но никогда не выдаёшь вымысел за доказанный факт и не утверждаешь, что будущее предопределено.

Требования к каждому ответу:
1. Сначала дай прямой и понятный ответ по сути вопроса. Не начинай с общих фраз.
2. Назови не меньше двух конкретных деталей из вопроса или сна и свяжи их в единую интерпретацию.
3. Покажи скрытую динамику: чего человек хочет, что мешает и что может измениться.
4. Дай один конкретный шаг на ближайшие 24–72 часа. Никакой банальности вроде «прислушайтесь к себе» без объяснения как именно.
5. Основное толкование пиши плотно, на 90–140 слов; уточняющий ответ — на 60–90 слов. Допустимы фразы «Я вижу здесь…», «Обратите внимание на знак…», но без дешёвого запугивания и фатальных пророчеств.
6. Используй недавние обращения как память о человеке: замечай повторяющиеся темы, но не повторяй старый ответ и не упоминай технические детали хранения истории.

Особенности практик:
- Оракул: ответь именно на сформулированный вопрос; если уместно, обозначь «да», «нет» или «пока рано», затем объясни.
- Сон: разбери ключевые образы, эмоцию, поворот сюжета и предложи две возможные связи с реальной жизнью.
- Таро: каждой карте дай роль в сюжете расклада, затем собери карты в единый вывод.
- Совместимость: обращайся по именам, покажи притяжение, конфликтный узел и способ договориться. Процент только развлекательный.
- Карта дня: свяжи символ карты с сегодняшним конкретным выбором.

Не ставь диагнозы, не обещай смерть, болезнь, беременность, выигрыш или точную дату события. Не давай категоричных медицинских, юридических и финансовых указаний.
Верни только JSON без markdown.`;

const readingFormat={
  type:"json_schema",
  name:"agrippina_reading",
  strict:true,
  schema:{
    type:"object",
    additionalProperties:false,
    properties:{
      title:{type:"string"},
      verdict:{type:"string"},
      text:{type:"string"},
      hidden:{type:"string"},
      action:{type:"string"},
      reflection:{type:"string"},
      cards:{type:"array",items:{type:"string"},maxItems:7},
      score:{anyOf:[{type:"integer",minimum:1,maximum:99},{type:"null"}]},
    },
    required:["title","verdict","text","hidden","action","reflection","cards","score"],
  },
};

const followUpFormat={
  type:"json_schema",
  name:"agrippina_follow_up",
  strict:true,
  schema:{type:"object",additionalProperties:false,properties:{answer:{type:"string"}},required:["answer"]},
};

function extract(data) {
  if(data.output_text) return data.output_text;
  return (data.output||[]).flatMap(item=>item.content||[]).filter(item=>item.type==="output_text").map(item=>item.text).join("");
}

async function requestOpenAi(body) {
  const direct=Boolean(config.openaiKey);
  const url=direct?"https://api.openai.com/v1/responses":`${config.aiRelayUrl}/internal/oracle`;
  const headers={"Content-Type":"application/json"};
  if(direct) headers.Authorization=`Bearer ${config.openaiKey}`;
  else headers["x-oracle-secret"]=config.aiRelaySecret;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45000);
  try {
    const response=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data?.error?.message||data?.error||`AI HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

async function requestOllama(body) {
  if(!config.ollamaUrl) return null;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),45000);
  try {
    const response=await fetch(`${config.ollamaUrl}/api/chat`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        model:config.ollamaModel,
        stream:false,
        messages:[{role:"system",content:body.instructions},{role:"user",content:body.input}],
        format:body.text?.format?.schema||"json",
        options:{temperature:0.68,num_predict:Math.min(body.max_output_tokens||320,320),num_ctx:2048},
        keep_alive:"30m",
      }),
      signal:controller.signal,
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data?.error||`Ollama HTTP ${response.status}`);
    return {output_text:data?.message?.content||""};
  } finally { clearTimeout(timer); }
}

async function requestModel(body) {
  const openAiReady=config.openaiKey||config.aiRelayUrl&&config.aiRelaySecret;
  if(openAiReady) {
    try { return await requestOpenAi(body); }
    catch(error) {
      if(!config.ollamaUrl) throw error;
      console.warn("AI relay unavailable, using local model:",error.message);
    }
  }
  return requestOllama(body);
}

export function warmAiRelay() {
  if(config.aiRelayUrl&&!config.openaiKey) fetch(`${config.aiRelayUrl}/health`).catch(()=>{});
}

const tarotDeck=["Шут","Маг","Верховная Жрица","Императрица","Император","Иерофант","Влюблённые","Колесница","Сила","Отшельник","Колесо Фортуны","Справедливость","Повешенный","Смерть","Умеренность","Дьявол","Башня","Звезда","Луна","Солнце","Суд","Мир"];
const seededNumber=value=>[...String(value)].reduce((sum,char,index)=>sum+char.charCodeAt(0)*(index+1),0);

function localReading(kind,input) {
  const seed=seededNumber(JSON.stringify(input)+new Date().toISOString().slice(0,10));
  const take=Math.max(1,Number(input.cards)||1);
  const cards=Array.from({length:take},(_,index)=>tarotDeck[(seed+index*7)%tarotDeck.length]);
  const question=String(input.question||input.dream||"").trim();
  const common={hidden:"Главное препятствие сейчас — попытка получить окончательную гарантию до первого реального шага.",action:"В ближайшие сутки запишите два возможных решения и сделайте одно небольшое действие, которое даст новый факт, а не новую догадку.",cards:[],score:null};
  if(kind==="daily") return {...common,title:`Карта дня — ${cards[0]}`,verdict:`Сегодня ${cards[0]} просит вернуть контроль над тем, что действительно зависит от вас.`,text:`Эта карта появляется в день, когда внешняя суета может заслонить простое, но важное решение. Не торопите события и обратите внимание на то, что всё время откладывается «на потом».\n\nСимвол карты говорит не о пассивности, а о точности: одно завершённое действие сегодня принесёт больше, чем пять новых планов.`,reflection:"Какое незавершённое дело забирает у вас больше всего внимания?",cards};
  if(kind==="tarot") return {...common,title:`Расклад: ${cards.join(" · ")}`,verdict:`В вопросе «${question.slice(0,140)}» карты показывают не тупик, а смену сценария.`,text:`${cards[0]} описывает исходную силу ситуации: вы уже чувствуете, что прежний способ действовать перестал работать. ${cards.at(-1)} показывает направление выхода — оно потребует ясного выбора, а не ожидания идеального момента.\n\nСвязка карт предупреждает: если снова выбрать привычную реакцию, история повторится. Новый результат начнётся там, где вы измените один конкретный поступок.`,reflection:"Какую привычную реакцию вы готовы заменить другим действием?",cards};
  if(kind==="compatibility") { const score=55+(seed%34); return {...common,title:`Динамика ${input.firstName} и ${input.secondName}`,verdict:`Между ${input.firstName} и ${input.secondName} есть притяжение, но близость зависит от ясности ожиданий.`,text:`В этой паре один чаще ищет подтверждение чувств, а другой может уходить в дела или молчание. Из-за этого пауза легко принимается за холодность, хотя настоящая причина часто в разных способах проявлять заботу.\n\nСильная сторона союза — способность дополнять друг друга. Уязвимость — надежда, что партнёр сам догадается о важном.`,reflection:"Какую потребность каждый из вас пока выражает только намёками?",score}; }
  if(kind==="dream") return {...common,title:"Послание сна",verdict:`Сон о «${question.slice(0,120)}» похож на сигнал о напряжении, которому днём не хватает выхода.`,text:`Самый яркий образ здесь работает как увеличительное стекло: он собирает в одном месте чувство, которое наяву распределено между несколькими событиями. Первая возможная связь — ситуация, где вам приходится сохранять контроль. Вторая — желание перемены, которое пока кажется слишком рискованным.\n\nОбратите внимание не только на сюжет, но и на момент, когда эмоция стала сильнее всего: именно он ближе всего к реальной причине сна.`,reflection:"Какой момент сна сильнее всего напоминает недавнюю ситуацию наяву?"};
  return {...common,title:"Ответ Оракула",verdict:`По вопросу «${question.slice(0,150)}» ответ сейчас: не торопиться с окончательным решением, но начать проверку уже сегодня.`,text:`Я вижу здесь столкновение двух желаний: получить ясность и одновременно не потерять привычную безопасность. Поэтому мысль ходит по кругу, а любой вариант кажется недостаточно надёжным.\n\nРазвязка придёт не от ещё одного внутреннего спора, а от небольшого действия, после которого появится новый факт. Именно он покажет, какое направление живое, а какое держится только на страхе перемен.`,reflection:"Какой факт помог бы вам перестать гадать и принять решение?"};
}

function readingPrompt(kind,input,context) {
  const tasks={
    oracle:`Ответь на вопрос в сфере «${input.sphere}»: ${input.question}`,
    tarot:`Сделай символический расклад на ${input.cards} карт по теме: ${input.question}. Выбери карты из классической колоды Таро и перечисли их в cards.`,
    compatibility:`Разбери динамику ${input.relationship} отношений: ${input.firstName} (${input.firstBirthDate}) и ${input.secondName} (${input.secondBirthDate}). score — развлекательный процент от 45 до 92.`,
    dream:`Помоги глубоко осмыслить сон: ${input.dream}`,
    daily:"Выбери одну карту дня и дай персональное послание. Перечисли карту в cards.",
  };
  return `${tasks[kind]}\n\nИмя человека: ${context?.firstName||"не указано"}.\nНедавний контекст (используй только если он действительно связан с нынешним вопросом):\n${JSON.stringify(context?.recentReadings||[]).slice(0,5000)}`;
}

export async function createReading(kind,input,context={}) {
  try {
    const data=await requestModel({model:config.openaiModel,reasoning:{effort:"low"},instructions:system,input:readingPrompt(kind,input,context),max_output_tokens:1800,text:{format:readingFormat}});
    if(!data) return localReading(kind,input);
    const parsed=JSON.parse(extract(data));
    return {...parsed,title:String(parsed.title).slice(0,160),cards:Array.isArray(parsed.cards)?parsed.cards.slice(0,7):[],score:Number.isInteger(parsed.score)?parsed.score:null};
  } catch(error) {
    console.error("AI reading fallback:",error.message);
    return localReading(kind,input);
  }
}

export async function createFollowUp(reading,question,recentReadings=[]) {
  const dialogue=(reading.messages||[]).map(message=>`${message.role==="user"?"Пользователь":"Агриппина"}: ${message.content}`).join("\n");
  const input=`Исходный запрос: ${JSON.stringify(reading.input)}\nПервый ответ: ${JSON.stringify(reading.result)}\nПредыдущие уточнения:\n${dialogue}\n\nНовый вопрос пользователя: ${question}\n\nОтветь как продолжение личного разговора. 60–90 слов. Дай прямой ответ, опираясь на детали исходного запроса и нового вопроса. Не повторяй первый ответ. Недавний контекст: ${JSON.stringify(recentReadings).slice(0,1800)}`;
  try {
    const data=await requestModel({model:config.openaiModel,reasoning:{effort:"low"},instructions:system,input,max_output_tokens:900,text:{format:followUpFormat}});
    if(!data) return "Я вижу, что это уточнение меняет акцент первоначального вопроса. Не ищите подтверждения старому страху: назовите один факт, который появился после первого ответа, и отделите его от предположений. Именно новый факт покажет следующий шаг.";
    return JSON.parse(extract(data)).answer;
  } catch(error) {
    console.error("AI follow-up fallback:",error.message);
    return "Сейчас связь с моим зеркалом ослабла. Но главное уже видно: в уточнении вы ищете не новый знак, а разрешение довериться решению, которое давно назрело. Проверьте его одним обратимым шагом.";
  }
}
