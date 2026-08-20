import React, { useState, useEffect, useRef } from "react";
import { Send, MessageCircle, Paperclip, X } from "lucide-react";
import {
  fetchChatMessages, sendChatMessage, subscribeToChatMessages,
  markChatRead, fetchTrainerInbox, uploadChatAttachment, getSignedFileUrl,
  fetchReactionsForMessages, subscribeToChatReactions, toggleChatReaction,
} from "../lib/api";

const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const NAV_REST_BOTTOM = "calc(78px + env(safe-area-inset-bottom, 0px))";

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function dateLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Сегодня";
  if (sameDay(d, yest)) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

// Точная высота клавиатуры = разница между полной высотой окна (не меняется,
// т.к. в index.html убран interactive-widget=resizes-content — поэтому нижнее
// меню приложения и не двигается) и видимой visualViewport (которая всегда
// корректно сжимается под клавиатуру). Поле ввода следует именно за ней.
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () => {
      const kb = window.innerHeight - vv.height - vv.offsetTop;
      setHeight(Math.max(0, Math.round(kb)));
    };
    vv.addEventListener("resize", handler);
    vv.addEventListener("scroll", handler);
    handler();
    return () => { vv.removeEventListener("resize", handler); vv.removeEventListener("scroll", handler); };
  }, []);
  return height;
}

function ChatAttachment({ path, type }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getSignedFileUrl("chat-attachments", path).then((u) => { if (!cancelled) setUrl(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [path]);

  if (!url) return <div style={{ width: 180, height: 120, borderRadius: 10, background: "rgba(0,0,0,0.08)" }} />;
  return type === "video" ? (
    <video src={url} controls playsInline preload="metadata" style={{ width: "100%", maxWidth: 220, borderRadius: 10 }} />
  ) : (
    <img src={url} alt="" style={{ width: "100%", maxWidth: 220, borderRadius: 10 }} />
  );
}

function ReactionBar({ messageId, reactions, authUserId, onToggle }) {
  const grouped = {};
  reactions.forEach((r) => { grouped[r.emoji] = (grouped[r.emoji] || 0) + 1; });
  const myReaction = reactions.find((r) => r.auth_user_id === authUserId)?.emoji;
  if (Object.keys(grouped).length === 0) return null;
  return (
    <div className="flex gap-1 mt-1 flex-wrap">
      {Object.entries(grouped).map(([emoji, count]) => (
        <button type="button"
          key={emoji}
          onClick={() => onToggle(messageId, emoji)}
          className="text-xs flex items-center gap-0.5 px-1.5 py-0.5"
          style={{
            borderRadius: 10, border: "1px solid var(--line)",
            background: myReaction === emoji ? "rgba(10,132,255,0.12)" : "var(--surface)",
          }}
        >{emoji} {count}</button>
      ))}
    </div>
  );
}

export function ChatPanel({ clientId, currentSender, senderRole, authUserId }) {
  const [messages, setMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [pickerFor, setPickerFor] = useState(null);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const keyboardHeight = useKeyboardHeight();

  useEffect(() => {
    setLoading(true);
    fetchChatMessages(clientId).then((m) => {
      setMessages(m);
      setLoading(false);
      fetchReactionsForMessages(m.map((x) => x.id)).then(setReactions);
    });
    if (authUserId) markChatRead(authUserId, clientId);

    const unsubMsgs = subscribeToChatMessages(clientId, (msg) => {
      setMessages((prev) => [...prev, msg]);
      if (authUserId) markChatRead(authUserId, clientId);
    });
    const unsubReactions = subscribeToChatReactions((payload) => {
      setReactions((prev) => {
        if (payload.eventType === "DELETE") return prev.filter((r) => r.id !== payload.old.id);
        if (payload.eventType === "INSERT") return [...prev, payload.new];
        if (payload.eventType === "UPDATE") return prev.map((r) => (r.id === payload.new.id ? payload.new : r));
        return prev;
      });
    });
    return () => { unsubMsgs(); unsubReactions(); };
  }, [clientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    await sendChatMessage(clientId, currentSender, senderRole, t);
  };

  const handleFilePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const attachment = await uploadChatAttachment(clientId, file);
      await sendChatMessage(clientId, currentSender, senderRole, text.trim() || null, attachment);
      setText("");
    } catch (err) {
      // молча — пользователь просто не увидит новое сообщение, не критично
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleToggleReaction = async (messageId, emoji) => {
    setPickerFor(null);
    await toggleChatReaction(messageId, authUserId, emoji);
  };

  if (loading) return <p className="text-sm px-4" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>;

  const inputBottom = keyboardHeight > 40 ? keyboardHeight : NAV_REST_BOTTOM;

  return (
    <div>
      <div
        className="px-4 space-y-1 fp-scroll"
        style={{ paddingBottom: `calc(${keyboardHeight > 40 ? `${keyboardHeight}px` : NAV_REST_BOTTOM} + 76px)` }}
      >
        {messages.length === 0 && (
          <p className="text-sm text-center mt-8" style={{ color: "var(--ink-soft)" }}>Сообщений пока нет — напишите первым.</p>
        )}
        {messages.map((m, i) => {
          const mine = m.from_name === currentSender;
          const showDateSep = i === 0 || dateLabel(m.created_at) !== dateLabel(messages[i - 1].created_at);
          const msgReactions = reactions.filter((r) => r.message_id === m.id);
          return (
            <React.Fragment key={m.id}>
              {showDateSep && (
                <div className="text-center my-3">
                  <span className="text-[11px] px-2 py-0.5" style={{ color: "var(--ink-soft)", background: "var(--bg)", borderRadius: 8 }}>
                    {dateLabel(m.created_at)}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", marginBottom: 6 }}>
                <div
                  onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                  className="p-2.5"
                  style={{
                    maxWidth: "75%", borderRadius: 16, cursor: "pointer",
                    borderBottomRightRadius: mine ? 5 : 16,
                    borderBottomLeftRadius: mine ? 16 : 5,
                    background: mine ? "#0A84FF" : "var(--surface)",
                    color: mine ? "#fff" : "var(--ink)",
                    border: mine ? "none" : "1px solid var(--line)",
                    boxShadow: mine ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
                  }}
                >
                  {!mine && <div className="text-xs font-semibold mb-0.5" style={{ opacity: 0.6 }}>{m.from_name}</div>}
                  {m.attachment_url && (
                    <div style={{ marginBottom: m.text ? 6 : 0 }}>
                      <ChatAttachment path={m.attachment_url} type={m.attachment_type} />
                    </div>
                  )}
                  {m.text && <div className="text-sm" style={{ lineHeight: 1.35 }}>{m.text}</div>}
                  <div className="text-[10px] mt-1" style={{ opacity: 0.6, textAlign: "right" }}>{formatTime(m.created_at)}</div>
                </div>

                {pickerFor === m.id && (
                  <div className="flex gap-1.5 mt-1.5 p-1.5 fp-card" style={{ background: "var(--surface)" }}>
                    {QUICK_EMOJI.map((e) => (
                      <button type="button" key={e} onClick={() => handleToggleReaction(m.id, e)} style={{ fontSize: 18, lineHeight: 1 }}>{e}</button>
                    ))}
                  </div>
                )}

                <ReactionBar messageId={m.id} reactions={msgReactions} authUserId={authUserId} onToggle={handleToggleReaction} />
              </div>
            </React.Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{
          position: "fixed", left: 0, right: 0, bottom: inputBottom, zIndex: 45, transition: "bottom 0.12s ease",
          background: "var(--surface)", borderTop: "1px solid var(--line)",
        }}
      >
        <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFilePick} style={{ display: "none" }} />
        <button type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          style={{ width: 34, height: 34 }}
        >
          <Paperclip size={18} color="var(--ink-soft)" />
        </button>
        <input
          className="fp-input"
          style={{ borderRadius: 20 }}
          placeholder={uploading ? "Отправляем вложение…" : "Написать сообщение…"}
          value={text}
          disabled={uploading}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button"
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 34, height: 34, borderRadius: "50%", background: text.trim() ? "#0A84FF" : "var(--line)", color: "#fff", border: "none" }}
          onClick={submit}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

export function TrainerInbox({ trainer, clients, onOpenChat }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (clients.length === 0) { setRows([]); setLoading(false); return; }
    setLoading(true);
    fetchTrainerInbox(trainer.auth_user_id, clients).then((r) => { setRows(r); setLoading(false); });
  };

  useEffect(() => { load(); }, [trainer.id, clients.length]);

  if (loading) return <p className="text-sm px-4" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>;

  if (rows.length === 0) {
    return <p className="text-sm px-4" style={{ color: "var(--ink-soft)" }}>Нет клиентов с чатом (доступен на тарифе VIP).</p>;
  }

  return (
    <div className="px-4 space-y-2">
      {rows.map(({ client, lastMessage, unreadCount }) => (
        <button type="button"
          key={client.id}
          onClick={() => onOpenChat(client)}
          className="fp-card w-full p-3 flex items-center gap-3 text-left"
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--solid-dark)" }}>
            <MessageCircle size={16} color="#fff" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{client.name}</span>
              {unreadCount > 0 && (
                <span
                  className="text-xs font-bold flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--accent)", color: "#fff", borderRadius: 999, minWidth: 20, height: 20, padding: "0 6px" }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            <p className="text-xs truncate" style={{ color: "var(--ink-soft)" }}>
              {lastMessage ? (lastMessage.text || (lastMessage.attachment_type === "video" ? "📹 Видео" : "📷 Фото")) : "Сообщений пока нет"}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
