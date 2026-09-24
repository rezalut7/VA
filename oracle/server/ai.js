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

export async function createReading(kind,input) {
  if (!config.openaiKey) throw Object.assign(new Error("AI временно не настроен"),{status:503});
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
