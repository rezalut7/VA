import React, { useState, useEffect } from "react";
import { Bell, Lock, User as UserIcon, Check } from "lucide-react";
import { fetchNotificationPreferences, updateNotificationPreferences, changePassword } from "../lib/api";
import { PUSH_ERROR_MESSAGES } from "../lib/push";

export function NotificationSettingsCard({
  pushSupportedNow, pushStatus, pushDetail, onEnable, onDisable, authUserId, messagesLabel, workoutsLabel,
}) {
  const [prefs, setPrefs] = useState({ notify_messages: true, notify_workouts: true });
  const [loadedPrefs, setLoadedPrefs] = useState(false);

  useEffect(() => {
    if (pushStatus === "on" && authUserId && !loadedPrefs) {
      fetchNotificationPreferences(authUserId).then((p) => { setPrefs(p); setLoadedPrefs(true); });
    }
  }, [pushStatus, authUserId, loadedPrefs]);

  const togglePref = async (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    await updateNotificationPreferences(authUserId, { notify_messages: next.notify_messages, notify_workouts: next.notify_workouts });
  };

  if (!pushSupportedNow) return null;

  return (
    <div className="fp-card p-4 mb-3">
      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
        <Bell size={13} /> УВЕДОМЛЕНИЯ
      </div>
      {pushStatus === "on" ? (
        <>
          <p className="text-xs mb-3" style={{ color: "var(--accent-2)" }}>Уведомления включены ✓</p>
          <div className="space-y-2 mb-3">
            <label className="flex items-center justify-between text-xs">
              <span>{messagesLabel}</span>
              <input type="checkbox" checked={prefs.notify_messages} onChange={() => togglePref("notify_messages")} />
            </label>
            <label className="flex items-center justify-between text-xs">
              <span>{workoutsLabel}</span>
              <input type="checkbox" checked={prefs.notify_workouts} onChange={() => togglePref("notify_workouts")} />
            </label>
          </div>
          <button className="fp-btn fp-btn-outline w-full py-2 text-xs" onClick={onDisable} disabled={pushStatus === "busy"}>
            Отключить уведомления совсем
          </button>
        </>
      ) : (
        <>
          <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>
            Получайте push-уведомления на этом устройстве.
          </p>
          <button className="fp-btn fp-btn-outline w-full py-2 text-xs" onClick={onEnable} disabled={pushStatus === "busy"}>
            {pushStatus === "busy" ? "Включаем…" : "Включить уведомления"}
          </button>
          {pushStatus && pushStatus !== "busy" && PUSH_ERROR_MESSAGES[pushStatus] && (
            <div className="mt-2">
              <p className="text-xs" style={{ color: "var(--danger)" }}>{PUSH_ERROR_MESSAGES[pushStatus]}</p>
              {pushDetail && <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>Подробности: {pushDetail}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ProfileEditCard({ name, onSaveName, extraFields, onSaveExtra }) {
  const [editedName, setEditedName] = useState(name);
  const [extra, setExtra] = useState(extraFields ? Object.fromEntries(extraFields.map((f) => [f.key, f.value])) : {});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    if (editedName.trim() && editedName.trim() !== name) await onSaveName(editedName.trim());
    if (extraFields && onSaveExtra) await onSaveExtra(extra);
    setBusy(false);
    setSaved(true);
  };

  return (
    <div className="fp-card p-4 mb-3">
      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
        <UserIcon size={13} /> ДАННЫЕ ПРОФИЛЯ
      </div>
      <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Имя</label>
      <input className="fp-input mb-3" value={editedName} onChange={(e) => setEditedName(e.target.value)} />
      {extraFields?.map((f) => (
        <div key={f.key} className="mb-3">
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>{f.label}</label>
          {f.multiline ? (
            <textarea className="fp-input" rows={2} value={extra[f.key] || ""} onChange={(e) => setExtra((prev) => ({ ...prev, [f.key]: e.target.value }))} />
          ) : (
            <input className="fp-input" value={extra[f.key] || ""} onChange={(e) => setExtra((prev) => ({ ...prev, [f.key]: e.target.value }))} />
          )}
        </div>
      ))}
      <button className="fp-btn fp-btn-outline w-full py-2 text-xs flex items-center justify-center gap-1.5" disabled={busy} onClick={save}>
        {saved ? <><Check size={13} /> Сохранено</> : busy ? "Сохраняем…" : "Сохранить"}
      </button>
    </div>
  );
}

export function PasswordChangeCard() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const submit = async () => {
    setStatus(null);
    if (password.length < 6) { setStatus("short"); return; }
    if (password !== confirm) { setStatus("mismatch"); return; }
    setBusy(true);
    try {
      await changePassword(password);
      setStatus("ok");
      setPassword(""); setConfirm("");
    } catch (e) {
      setStatus("error");
    }
    setBusy(false);
  };

  return (
    <div className="fp-card p-4 mb-3">
      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
        <Lock size={13} /> СМЕНА ПАРОЛЯ
      </div>
      <input className="fp-input mb-2" type="password" placeholder="Новый пароль" value={password} onChange={(e) => setPassword(e.target.value)} />
      <input className="fp-input mb-2" type="password" placeholder="Повторите пароль" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {status === "short" && <p className="text-xs mb-2" style={{ color: "var(--danger)" }}>Пароль должен быть не короче 6 символов.</p>}
      {status === "mismatch" && <p className="text-xs mb-2" style={{ color: "var(--danger)" }}>Пароли не совпадают.</p>}
      {status === "error" && <p className="text-xs mb-2" style={{ color: "var(--danger)" }}>Не получилось сменить пароль — попробуйте ещё раз.</p>}
      {status === "ok" && <p className="text-xs mb-2" style={{ color: "var(--accent-2)" }}>Пароль изменён ✓</p>}
      <button className="fp-btn fp-btn-outline w-full py-2 text-xs disabled:opacity-40" disabled={busy || !password || !confirm} onClick={submit}>
        {busy ? "Сохраняем…" : "Сменить пароль"}
      </button>
    </div>
  );
}
