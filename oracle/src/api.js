function readStoredToken() {
  try { return globalThis.localStorage?.getItem("agrippina_token") || ""; }
  catch { return ""; }
}

let token = readStoredToken();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function setToken(value) {
  token = value;
  try { globalThis.localStorage?.setItem("agrippina_token", value); }
  catch { /* Telegram privacy settings may disable storage. */ }
}

export function extractTelegramInitData(href) {
  if (!href) return "";
  try {
    const url = new URL(href, "https://mini-app.invalid");
    const hash = url.hash.replace(/^#/, "");
    const candidates = [url.search.slice(1), hash, hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : ""];
    for (const candidate of candidates) {
      const value = new URLSearchParams(candidate).get("tgWebAppData");
      if (value) return value;
    }
  } catch { /* Ignore malformed launch URLs and use the SDK fallback. */ }
  return "";
}

function telegramWebApp() {
  return typeof window !== "undefined" ? window.Telegram?.WebApp : null;
}

function prepareTelegram(tg) {
  try { tg?.ready?.(); } catch { /* Native bridge can be briefly unavailable. */ }
  try { tg?.expand?.(); } catch { /* Expansion is optional. */ }
}

async function waitForTelegramInitData(maxWaitMs = 2500) {
  const deadline = Date.now() + maxWaitMs;
  do {
    const tg = telegramWebApp();
    prepareTelegram(tg);
    const fromSdk = tg?.initData || "";
    const fromLaunchUrl = typeof location !== "undefined" ? extractTelegramInitData(location.href) : "";
    if (fromSdk || fromLaunchUrl) return fromSdk || fromLaunchUrl;
    if (Date.now() >= deadline) break;
    await sleep(80);
  } while (true);
  return "";
}

function friendlyNetworkError(error) {
  if (error?.name === "AbortError") return new Error("Сервер отвечает дольше обычного. Нажмите «Повторить подключение».");
  if (error instanceof TypeError) return new Error("Соединение прервалось. Переключать VPN не нужно — просто повторите подключение.");
  return error;
}

export async function api(path, options = {}) {
  const { timeout = 15000, retries = /^(GET|HEAD)$/i.test(options.method || "GET") ? 2 : 0, retryDelay = 450, ...fetchOptions } = options;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(path, {
        ...fetchOptions,
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(fetchOptions.headers || {}),
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || data.error || "Ошибка запроса");
        error.status = response.status;
        error.data = data;
        error.transient = response.status === 408 || response.status === 429 || response.status >= 500;
        throw error;
      }
      return data;
    } catch (error) {
      lastError = error;
      const transient = error?.transient || error?.name === "AbortError" || error instanceof TypeError;
      if (!transient || attempt === retries) throw friendlyNetworkError(error);
      await sleep(retryDelay * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw friendlyNetworkError(lastError);
}

export async function authenticate() {
  const initData = await waitForTelegramInitData();
  let telegramAuthError;

  if (initData) {
    try {
      const result = await api("/api/auth/telegram", {
        method: "POST",
        body: JSON.stringify({ initData }),
        timeout: 10000,
        retries: 3,
      });
      setToken(result.token);
      return result.user;
    } catch (error) {
      telegramAuthError = error;
      if (error.status && error.status !== 401) throw error;
    }
  }

  if (token) {
    try { return await api("/api/me", { timeout: 10000, retries: 2 }); }
    catch (error) { if (error.status !== 401) throw error; }
  }

  if (import.meta.env.DEV) {
    const result = await api("/api/auth/dev", { method: "POST", retries: 1 });
    setToken(result.token);
    return result.user;
  }

  if (telegramAuthError) throw new Error("Сессия Telegram устарела. Закройте Mini App и откройте его из бота снова.");
  throw new Error("Telegram не передал данные запуска. Откройте Mini App кнопкой внутри бота.");
}

export function share(text, sharedUrl = location.origin) {
  const url = `https://t.me/share/url?url=${encodeURIComponent(sharedUrl)}&text=${encodeURIComponent(text)}`;
  if (telegramWebApp()?.openTelegramLink) telegramWebApp().openTelegramLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
