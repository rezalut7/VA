// Open Food Facts proxy
//
// Much simpler than the FatSecret one — Open Food Facts is a free, keyless public
// API, so this server does NOT hold any secret. Its only two jobs are:
//   1. Add correct CORS headers so the browser (running inside the Claude artifact
//      sandbox, or your own future frontend) is allowed to call it.
//   2. Shape the response into exactly what the frontend already expects (see
//      searchFoods/getFoodDetails in the React app) so swapping the URL is a
//      one-line change once this is deployed.
//
//   GET /api/food/search?q=молоко   -> [{ id, name }, ...]
//   GET /api/food/:id               -> { id, name, servings: [{ id, label, kcal, protein, carbs, fat }] }
//
// "id" here is the product's barcode (Open Food Facts calls it "code").

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors()); // lock this down to your real frontend origin before going live

const PORT = process.env.PORT || 3002;
// Open Food Facts asks every integration to send a descriptive User-Agent.
const USER_AGENT = process.env.APP_USER_AGENT || "FitnessPlatformPrototype/1.0 (contact@example.com)";

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
    const url = new URL(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(req.params.id)}.json`);
    url.searchParams.set("fields", "product_name,product_name_ru,nutriments,serving_size");

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
    if (p.serving_size && typeof n["energy-kcal_serving"] === "number") {
      servings.push({
        id: `${req.params.id}-serving`,
        label: p.serving_size,
        kcal: round1(n["energy-kcal_serving"] || 0),
        protein: round1(n["proteins_serving"] || 0),
        carbs: round1(n["carbohydrates_serving"] || 0),
        fat: round1(n["fat_serving"] || 0),
      });
    }

    if (servings.length === 0) return res.status(404).json({ error: "no_nutrition_data" });

    res.json({ id: req.params.id, name: p.product_name_ru || p.product_name, servings });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "food_details_failed" });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Open Food Facts proxy listening on :${PORT}`));
