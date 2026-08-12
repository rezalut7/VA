// Vercel serverless function: GET /api/food/[id]
// id is expected as "fs_<food_id>" (the prefix our search endpoint adds, so the
// frontend can tell FatSecret ids apart from local/OFF ids). Returns:
// { id, name, servings: [{ id, label, kcal, protein, carbs, fat }] }

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing FATSECRET_CLIENT_ID / FATSECRET_CLIENT_SECRET");

  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "basic" }),
  });
  if (!res.ok) throw new Error(`FatSecret token request failed (${res.status})`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  const rawId = req.query.id || "";
  const foodId = rawId.startsWith("fs_") ? rawId.slice(3) : rawId;
  if (!foodId) return res.status(400).json({ error: "missing_id" });

  try {
    const token = await getAccessToken();
    const url = new URL("https://platform.fatsecret.com/rest/server.api");
    url.searchParams.set("method", "food.get.v5");
    url.searchParams.set("food_id", foodId);
    url.searchParams.set("format", "json");
    url.searchParams.set("region", "RU");
    url.searchParams.set("language", "ru");

    const apiRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!apiRes.ok) throw new Error(`FatSecret food.get failed (${apiRes.status})`);
    const data = await apiRes.json();
    const food = data?.food;
    if (!food) return res.status(404).json({ error: "not_found" });

    const rawServings = food.servings?.serving;
    const servingsList = Array.isArray(rawServings) ? rawServings : rawServings ? [rawServings] : [];

    const servings = servingsList.map((s) => ({
      id: `${rawId}-${s.serving_id}`,
      label: s.serving_description,
      kcal: Number(s.calories) || 0,
      protein: Number(s.protein) || 0,
      carbs: Number(s.carbohydrate) || 0,
      fat: Number(s.fat) || 0,
    }));

    res.status(200).json({ id: rawId, name: food.food_name, servings });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "food_details_failed" });
  }
}
