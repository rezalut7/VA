let token = localStorage.getItem("agrippina_token") || "";

export function setToken(value) {
  token = value;
  localStorage.setItem("agrippina_token", value);
}

export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || "Ошибка запроса");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function authenticate() {
  const tg = window.Telegram?.WebApp;
  tg?.ready();
  tg?.expand();
  if (tg?.initData) {
    const result = await api("/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData: tg.initData }),
    });
    setToken(result.token);
    return result.user;
  }
  const result = await api("/api/auth/dev", { method: "POST" });
  setToken(result.token);
  return result.user;
}

export function share(text) {
  const url = `https://t.me/share/url?url=${encodeURIComponent(location.origin)}&text=${encodeURIComponent(text)}`;
  if (window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
