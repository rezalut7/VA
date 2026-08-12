// Vercel serverless function: GET /api/food/search?q=...
// Holds the FatSecret Client ID/Secret as server-side env vars (never sent to
// the browser) and returns results already shaped for the frontend:
// [{ id, name }, ...]

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
  const q = (req.query.q || "").trim();
  if (!q) return res.status(200).json([]);

  try {
    const token = await getAccessToken();
    const url = new URL("https://platform.fatsecret.com/rest/server.api");
    url.searchParams.set("method", "foods.search");
    url.searchParams.set("search_expression", q);
    url.searchParams.set("max_results", "8");
    url.searchParams.set("format", "json");
    url.searchParams.set("region", "RU");
    url.searchParams.set("language", "ru");

    const apiRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!apiRes.ok) throw new Error(`FatSecret search failed (${apiRes.status})`);
    const data = await apiRes.json();

    const foods = data?.foods?.food;
    const list = Array.isArray(foods) ? foods : foods ? [foods] : [];
    res.status(200).json(list.map((f) => ({ id: `fs_${f.food_id}`, name: f.food_name })));
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "food_search_failed" });
  }
}
