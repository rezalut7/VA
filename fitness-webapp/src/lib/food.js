import { FOOD_DB } from "../data/foodDb";

/* ------------------------- FOOD PROVIDER (live + fallback) -------------------------
 * Tries the free, keyless Open Food Facts search first. Falls back to the local
 * FOOD_DB mock if the live call fails for any reason, so the app never breaks.
 *
 * IMPORTANT: search uses Search-a-licious (search.openfoodfacts.org), NOT
 * world.openfoodfacts.org/api/v2/search — the v2 endpoint only does structured
 * tag/filter search (categories, brands...), it does NOT do full-text search by
 * product name. Search-a-licious is OFF's dedicated full-text search service.
 * Product detail lookups by barcode still use the regular v2 product endpoint.
 * ------------------------------------------------------------------------------- */

export async function searchFoods(query) {
  const q = query.trim();
  if (!q) return [];

  try {
    const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=8`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const hits = data.hits || data.products || [];
    const products = hits
      .map((p) => ({ id: p.code, name: p.product_name_ru || p.product_name || p.product_name_en }))
      .filter((p) => p.id && p.name);
    if (products.length > 0) return products;
  } catch (e) {
    // network error / CORS block / service down — fall through to the mock
  }

  return searchFoodsMock(q);
}

export async function getFoodDetails(foodId) {
  if (/^f\d+$/.test(foodId)) return getFoodDetailsMock(foodId);

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
    return getFoodDetailsMock(foodId);
  }
}

async function searchFoodsMock(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return FOOD_DB.filter((f) => f.name.toLowerCase().includes(q))
    .slice(0, 8)
    .map((f) => ({ id: f.id, name: f.name }));
}

async function getFoodDetailsMock(foodId) {
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
