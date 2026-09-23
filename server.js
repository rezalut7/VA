import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

const PORT = process.env.PORT || 3002;
const USER_AGENT =
  process.env.APP_USER_AGENT ||
  "FitnessPlatformPrototype/1.0 (contact@example.com)";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 3600);

function aliceResponse(text, sessionState = {}, endSession = false) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);

  return {
    response: {
      text: clean,
      tts: clean,
      end_session: endSession,
    },
    session_state: sessionState,
    version: "1.0",
  };
}

function extractOpenAIText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  return (data?.output || [])
    .flatMap((item) => item?.content || [])
    .filter((part) => part?.type === "output_text" && part?.text)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

async function askOpenAI(message, previousResponseId) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const body = {
      model: OPENAI_MODEL,
      reasoning: { effort: "none" },
      instructions:
        "Ты голосовой ассистент внутри колонки Алиса. Отвечай на русском языке, естественно и по существу. " +
        "Ответ предназначен для озвучивания: обычно 1-4 коротких предложения, без markdown, таблиц и длинных списков. " +
        "Если вопрос требует уточнения, задай один короткий уточняющий вопрос. Не говори, что ты Алиса.",
      input: message,
      store: true,
      max_output_tokens: 350,
    };

    if (previousResponseId) {
      body.previous_response_id = previousResponseId;
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        `OpenAI API error ${response.status}: ${JSON.stringify(data).slice(0, 500)}`
      );
    }

    const text = extractOpenAIText(data);
    if (!text) throw new Error("OpenAI returned empty text");

    return { text, responseId: data.id };
  } finally {
    clearTimeout(timeout);
  }
}

// Alice / Yandex Dialogs webhook.
app.post("/alice", async (req, res) => {
  const payload = req.body || {};
  const session = payload.session || {};
  const request = payload.request || {};
  const state = payload.state?.session || {};

  if (session.new) {
    return res.json(
      aliceResponse(
        "Привет! Я подключен к OpenAI. Задавай любой вопрос.",
        {}
      )
    );
  }

  const utterance = String(
    request.original_utterance || request.command || ""
  ).trim();

  if (!utterance) {
    return res.json(aliceResponse("Слушаю. Задай вопрос.", state));
  }

  if (/^(стоп|хватит|выход|закончить|завершить)$/i.test(utterance)) {
    return res.json(aliceResponse("Хорошо, до связи.", {}, true));
  }

  try {
    const result = await askOpenAI(utterance, state.previous_response_id);

    return res.json(
      aliceResponse(result.text, {
        previous_response_id: result.responseId,
      })
    );
  } catch (error) {
    console.error("Alice/OpenAI error:", error);

    const isTimeout =
      error?.name === "AbortError" ||
      String(error?.message || "").toLowerCase().includes("abort");

    return res.json(
      aliceResponse(
        isTimeout
          ? "Ответ занял слишком много времени. Повтори вопрос покороче."
          : "Сейчас не получилось получить ответ. Попробуй ещё раз.",
        state
      )
    );
  }
});

// Open Food Facts proxy
app.get("/api/food/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  try {
    const url = new URL("https://world.openfoodfacts.org/api/v2/search");
    url.searchParams.set("search_terms", q);
    url.searchParams.set("page_size", "8");
    url.searchParams.set("fields", "code,product_name,product_name_ru");

    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!r.ok) throw new Error(`OFF search failed (${r.status})`);
    const data = await r.json();

    const products = (data.products || [])
      .map((p) => ({ id: p.code, name: p.product_name_ru || p.product_name }))
      .filter((p) => p.id && p.name);

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "food_search_failed" });
  }
});

app.get("/api/food/:id", async (req, res) => {
  try {
    const url = new URL(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
        req.params.id
      )}.json`
    );
    url.searchParams.set(
      "fields",
      "product_name,product_name_ru,nutriments,serving_size"
    );

    const r = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!r.ok) throw new Error(`OFF product lookup failed (${r.status})`);
    const data = await r.json();
    const p = data.product;
    if (!p) return res.status(404).json({ error: "not_found" });

    const n = p.nutriments || {};
    const round1 = (x) => Math.round(x * 10) / 10;
    const servings = [];

    if (typeof n["energy-kcal_100g"] === "number") {
      servings.push({
        id: `${req.params.id}-100g`,
        label: "100 г",
        kcal: round1(n["energy-kcal_100g"] || 0),
        protein: round1(n["proteins_100g"] || 0),
        carbs: round1(n["carbohydrates_100g"] || 0),
        fat: round1(n["fat_100g"] || 0),
      });
    }

    if (
      p.serving_size &&
      typeof n["energy-kcal_serving"] === "number"
    ) {
      servings.push({
        id: `${req.params.id}-serving`,
        label: p.serving_size,
        kcal: round1(n["energy-kcal_serving"] || 0),
        protein: round1(n["proteins_serving"] || 0),
        carbs: round1(n["carbohydrates_serving"] || 0),
        fat: round1(n["fat_serving"] || 0),
      });
    }

    if (servings.length === 0) {
      return res.status(404).json({ error: "no_nutrition_data" });
    }

    res.json({
      id: req.params.id,
      name: p.product_name_ru || p.product_name,
      servings,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "food_details_failed" });
  }
});

app.get("/health", (req, res) =>
  res.json({
    ok: true,
    alice: true,
    openaiConfigured: Boolean(OPENAI_API_KEY),
    model: OPENAI_MODEL,
  })
);

app.listen(PORT, () => {
  console.log(`VA backend listening on :${PORT}`);
});
