// Open Food Facts proxy
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3002;
const USER_AGENT = process.env.APP_USER_AGENT || "VA/1.0 (contact@example.com)";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
}));

app.get("/api/food/search", async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 120);
  if (!q) return res.json([]);

  try {
    const url = new URL("https://world.openfoodfacts.org/api/v2/search");
    url.searchParams.set("search_terms", q);
    url.searchParams.set("page_size", "8");
    url.searchParams.set("fields", "code,product_name,product_name_ru");

    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`OFF search failed (${response.status})`);
    const data = await response.json();

    const products = (data.products || [])
      .map((product) => ({ id: product.code, name: product.product_name_ru || product.product_name }))
      .filter((product) => product.id && product.name);

    return res.json(products);
  } catch (error) {
    console.error("food search failed", error);
    return res.status(502).json({ error: "food_search_failed" });
  }
});

app.get("/api/food/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id || id.length > 64) return res.status(400).json({ error: "invalid_id" });

  try {
    const url = new URL(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(id)}.json`);
    url.searchParams.set("fields", "product_name,product_name_ru,nutriments,serving_size");

    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`OFF product lookup failed (${response.status})`);
    const data = await response.json();
    const product = data.product;
    if (!product) return res.status(404).json({ error: "not_found" });

    const nutrients = product.nutriments || {};
    const round1 = (value) => Math.round(Number(value || 0) * 10) / 10;
    const servings = [];

    if (Number.isFinite(nutrients["energy-kcal_100g"])) {
      servings.push({
        id: `${id}-100g`, label: "100 г",
        kcal: round1(nutrients["energy-kcal_100g"]), protein: round1(nutrients["proteins_100g"]),
        carbs: round1(nutrients["carbohydrates_100g"]), fat: round1(nutrients["fat_100g"]),
      });
    }

    if (product.serving_size && Number.isFinite(nutrients["energy-kcal_serving"])) {
      servings.push({
        id: `${id}-serving`, label: product.serving_size,
        kcal: round1(nutrients["energy-kcal_serving"]), protein: round1(nutrients["proteins_serving"]),
        carbs: round1(nutrients["carbohydrates_serving"]), fat: round1(nutrients["fat_serving"]),
      });
    }

    if (servings.length === 0) return res.status(404).json({ error: "no_nutrition_data" });
    return res.json({ id, name: product.product_name_ru || product.product_name || `Продукт ${id}`, servings });
  } catch (error) {
    console.error("food details failed", error);
    return res.status(502).json({ error: "food_details_failed" });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use((_req, res) => res.status(404).json({ error: "not_found" }));
app.use((error, _req, res, _next) => {
  console.error("request failed", error);
  res.status(500).json({ error: "request_failed" });
});

app.listen(PORT, () => console.log(`Open Food Facts proxy listening on :${PORT}`));
