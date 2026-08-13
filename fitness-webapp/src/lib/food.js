import { FOOD_DB } from "../data/foodDb";
import { searchProductsDb, getProductDetailsDb } from "./api";

/* ------------------------- FOOD PROVIDER (DB-first) -------------------------
 * 1. Supabase `products` table (~1,846 real items imported from Open Food Facts,
 *    see supabase_products_table.sql) — a real searchable database, not a JS
 *    array shipped to the browser. This is the primary source now.
 * 2. Small local FOOD_DB (~165 hand-written staples) — instant fallback if the
 *    DB query fails or is still warming up.
 * 3. Our own /api/food/* routes (FatSecret proxy) — same-origin, no CORS.
 * 4. Live Open Food Facts search-a-licious — last resort for anything else.
 *
 * Each tier only runs if the previous one didn't return enough results, and
 * any tier failing (network error, missing table, rate limit) falls through
 * to the next — the app always works on tier 2 alone at minimum.
 * ------------------------------------------------------------------------- */

async function searchFoodsLocal(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return FOOD_DB.filter((f) => f.name.toLowerCase().includes(q))
    .slice(0, 8)
    .map((f) => ({ id: f.id, name: f.name }));
}

async function searchFoodsDb(query) {
  try {
    return await searchProductsDb(query);
  } catch (e) {
    return [];
  }
}

async function searchFoodsFatSecret(query) {
  try {
    const res = await fetch(`/api/food/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data.filter((f) => f.id && f.name) : [];
  } catch (e) {
    return [];
  }
}

async function searchFoodsOpenFoodFacts(query) {
  try {
    const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=5`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const hits = data.hits || data.products || [];
    return hits
      .map((p) => ({ id: p.code, name: p.product_name_ru || p.product_name || p.product_name_en }))
      .filter((p) => p.id && p.name);
  } catch (e) {
    return [];
  }
}

export async function searchFoods(query) {
  const q = query.trim();
  if (!q) return [];

  const results = [];
  const seen = new Set();
  const addUnique = (list) => {
    for (const f of list) {
      if (!seen.has(f.id) && results.length < 8) {
        results.push(f);
        seen.add(f.id);
      }
    }
  };

  addUnique(await searchFoodsDb(q));
  if (results.length < 8) addUnique(await searchFoodsLocal(q));
  if (results.length < 8) addUnique(await searchFoodsFatSecret(q));
  if (results.length < 8) addUnique(await searchFoodsOpenFoodFacts(q));

  return results;
}

export async function getFoodDetails(foodId) {
  if (foodId.startsWith("db_")) return getFoodDetailsDb(foodId);
  if (/^f\d+$/.test(foodId)) return getFoodDetailsLocal(foodId);
  if (foodId.startsWith("fs_")) return getFoodDetailsFatSecret(foodId);
  return getFoodDetailsOpenFoodFacts(foodId);
}

async function getFoodDetailsDb(foodId) {
  try {
    const rawId = foodId.slice(3);
    const p = await getProductDetailsDb(rawId);
    if (!p) return null;
    const round1 = (n) => Math.round(n * 10) / 10;
    return {
      id: foodId,
      name: p.name,
      servings: [
        { id: `${foodId}-100g`, label: "100 г", kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat },
        {
          id: `${foodId}-portion`, label: "1 порция (200 г)",
          kcal: round1(p.kcal * 2), protein: round1(p.protein * 2),
          carbs: round1(p.carbs * 2), fat: round1(p.fat * 2),
        },
      ],
    };
  } catch (e) {
    return null;
  }
}

function getFoodDetailsLocal(foodId) {
  const f = FOOD_DB.find((x) => x.id === foodId);
  if (!f) return null;
  const round1 = (n) => Math.round(n * 10) / 10;
  return {
    id: f.id,
    name: f.name,
    servings: [
      { id: `${f.id}-100g`, label: "100 г", kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat },
      {
        id: `${f.id}-portion`, label: "1 порция (200 г)",
        kcal: round1(f.kcal * 2), protein: round1(f.protein * 2),
        carbs: round1(f.carbs * 2), fat: round1(f.fat * 2),
      },
    ],
  };
}

async function getFoodDetailsFatSecret(foodId) {
  try {
    const res = await fetch(`/api/food/${encodeURIComponent(foodId)}`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    if (!data || !data.servings || data.servings.length === 0) return null;
    return data;
  } catch (e) {
    return null;
  }
}

async function getFoodDetailsOpenFoodFacts(foodId) {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(foodId)}.json?fields=product_name,product_name_ru,nutriments,serving_size`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const p = data.product;
    if (!p) throw new Error("not found");
    const n = p.nutriments || {};
    const round1 = (x) => Math.round(x * 10) / 10;
    const servings = [];
    if (typeof n["energy-kcal_100g"] === "number") {
      servings.push({
        id: `${foodId}-100g`, label: "100 г",
        kcal: round1(n["energy-kcal_100g"] || 0), protein: round1(n["proteins_100g"] || 0),
        carbs: round1(n["carbohydrates_100g"] || 0), fat: round1(n["fat_100g"] || 0),
      });
    }
    if (p.serving_size && typeof n["energy-kcal_serving"] === "number") {
      servings.push({
        id: `${foodId}-serving`, label: p.serving_size,
        kcal: round1(n["energy-kcal_serving"] || 0), protein: round1(n["proteins_serving"] || 0),
        carbs: round1(n["carbohydrates_serving"] || 0), fat: round1(n["fat_serving"] || 0),
      });
    }
    if (servings.length === 0) throw new Error("no nutrition data");
    return { id: foodId, name: p.product_name_ru || p.product_name, servings };
  } catch (e) {
    return null;
  }
}
