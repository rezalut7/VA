import { savePushSubscription, deletePushSubscription } from "./api";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window;
}

// Возвращает { ok: true } либо { ok: false, reason, detail } — reason всегда
// заполнен, чтобы интерфейс мог показать точную причину, а не просто "не сработало".
export async function enablePushNotifications(authUserId) {
  if (!pushSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: "missing_vapid_key" };
  }
  if (!authUserId) {
    return { ok: false, reason: "no_auth" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: permission === "denied" ? "denied" : "dismissed" };
    }
  } catch (e) {
    return { ok: false, reason: "permission_error", detail: e.message };
  }

  let registration;
  try {
    registration = await navigator.serviceWorker.register("/sw.js");
    registration = await navigator.serviceWorker.ready;
  } catch (e) {
    return { ok: false, reason: "sw_register_failed", detail: e.message };
  }

  let subscription;
  try {
    subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
  } catch (e) {
    return { ok: false, reason: "subscribe_failed", detail: e.message };
  }

  try {
    await savePushSubscription(authUserId, subscription);
  } catch (e) {
    return { ok: false, reason: "save_failed", detail: e.message };
  }

  return { ok: true };
}

export async function disablePushNotifications() {
  try {
    if (!pushSupported()) return { ok: true };
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!registration) return { ok: true };
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await deletePushSubscription(subscription.endpoint);
      await subscription.unsubscribe();
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "unsubscribe_failed", detail: e.message };
  }
}

export const PUSH_ERROR_MESSAGES = {
  unsupported: "Браузер не поддерживает push-уведомления (на iPhone это работает только если сайт сохранён на экран «Домой» как приложение).",
  missing_vapid_key: "На сервере не настроен ключ уведомлений (VITE_VAPID_PUBLIC_KEY) — сообщите разработчику.",
  no_auth: "Не удалось определить пользователя — попробуйте выйти и войти заново.",
  denied: "Уведомления заблокированы в настройках браузера — разрешите их в настройках сайта и попробуйте снова.",
  dismissed: "Запрос на уведомления был закрыт без ответа — попробуйте ещё раз.",
  permission_error: "Не удалось запросить разрешение на уведомления.",
  sw_register_failed: "Не удалось зарегистрировать службу уведомлений (Service Worker).",
  subscribe_failed: "Не удалось подписаться на уведомления — проверьте ключ VAPID.",
  save_failed: "Подписка создана, но не сохранилась на сервере — проверьте подключение.",
  unsubscribe_failed: "Не получилось отключить уведомления — попробуйте ещё раз.",
};
