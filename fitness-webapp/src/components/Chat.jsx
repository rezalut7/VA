import React, { useState, useEffect, useRef } from "react";
import { Send, MessageCircle, ChevronLeft } from "lucide-react";
import {
  fetchChatMessages, sendChatMessage, subscribeToChatMessages,
  markChatRead, fetchTrainerInbox,
} from "../lib/api";

export function ChatPanel({ clientId, currentSender, senderRole, authUserId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    fetchChatMessages(clientId).then((m) => { setMessages(m); setLoading(false); });
    if (authUserId) markChatRead(authUserId, clientId);

    const unsubscribe = subscribeToChatMessages(clientId, (msg) => {
      setMessages((prev) => [...prev, msg]);
      if (authUserId) markChatRead(authUserId, clientId);
    });
    return unsubscribe;
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

  if (loading) return <p className="text-sm px-4" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 150px)" }}>
      <div className="flex-1 overflow-y-auto px-4 space-y-3 fp-scroll">
        {messages.length === 0 && (
          <p className="text-sm text-center mt-8" style={{ color: "var(--ink-soft)" }}>Сообщений пока нет — напишите первым.</p>
        )}
        {messages.map((m) => {
          const mine = m.from_name === currentSender;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
              <div
                className="p-2.5"
                style={{
                  maxWidth: "75%", borderRadius: 16,
                  borderBottomRightRadius: mine ? 5 : 16,
                  borderBottomLeftRadius: mine ? 16 : 5,
                  background: mine ? "#0A84FF" : "var(--surface)",
                  color: mine ? "#fff" : "var(--ink)",
                  border: mine ? "none" : "1px solid var(--line)",
                  boxShadow: mine ? "none" : "0 1px 2px rgba(0,0,0,0.04)",
                }}
              >
                {!mine && <div className="text-xs font-semibold mb-0.5" style={{ opacity: 0.6 }}>{m.from_name}</div>}
                <div className="text-sm" style={{ lineHeight: 1.35 }}>{m.text}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--line)" }}>
        <input
          className="fp-input"
          style={{ borderRadius: 20 }}
          placeholder="Написать сообщение…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <button
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
        <button
          key={client.id}
          onClick={() => onOpenChat(client)}
          className="fp-card w-full p-3 flex items-center gap-3 text-left"
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--ink)" }}>
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
              {lastMessage ? lastMessage.text : "Сообщений пока нет"}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
