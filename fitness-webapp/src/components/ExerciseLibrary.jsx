import React, { useState, useEffect } from "react";
import { BookOpen, Save, Video, Search, PlayCircle } from "lucide-react";
import { EXERCISE_GROUPS } from "../data/exerciseGroups";
import { fetchAllExerciseDetails, fetchExerciseDetail, upsertExerciseDetail } from "../lib/api";

// Список базовых названий упражнений (без снаряда/варианта) для редактирования.
export function allBaseExerciseNames() {
  const names = new Set();
  EXERCISE_GROUPS.forEach((g) => g.exercises.forEach((e) => names.add(e.name)));
  return [...names].sort();
}

// Полное название тренировки собирается как "Группа - Упражнение - Снаряд - Вариант".
// Достаём именно базовое "Упражнение" (второй сегмент), чтобы найти его описание.
export function extractBaseExerciseName(fullName) {
  const parts = (fullName || "").split(" - ");
  return parts.length >= 2 ? parts[1] : fullName;
}

function toEmbedUrl(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  return url;
}

/* ------------------------------ ТРЕНЕР: РЕДАКТОР ------------------------------ */

export function ExerciseLibraryManager() {
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = () => { setLoading(true); fetchAllExerciseDetails().then((d) => { setDetails(d); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const names = allBaseExerciseNames().filter((n) => n.toLowerCase().includes(query.toLowerCase()));

  const pick = (name) => {
    setSelected(name);
    setSaved(false);
    const existing = details[name];
    setDescription(existing?.description || "");
    setVideoUrl(existing?.video_url || "");
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    await upsertExerciseDetail(selected, description.trim(), videoUrl.trim());
    setBusy(false);
    setSaved(true);
    load();
  };

  return (
    <div className="px-4">
      <div className="flex items-center gap-1.5 mb-3">
        <BookOpen size={15} color="var(--accent)" />
        <h2 className="fp-display text-xl font-semibold">Библиотека упражнений</h2>
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
        Добавьте описание техники и видео к упражнению — клиент увидит их прямо во время тренировки.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <Search size={15} color="var(--ink-soft)" />
        <input className="fp-input" placeholder="Найти упражнение…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>
      ) : !selected ? (
        <div className="fp-card fp-scroll" style={{ maxHeight: 400, overflowY: "auto" }}>
          {names.map((n) => (
            <button key={n} onClick={() => pick(n)} className="w-full text-left px-3 py-2.5 text-sm border-b last:border-0 flex items-center justify-between" style={{ borderColor: "var(--line)" }}>
              <span>{n}</span>
              {details[n] && <Video size={13} color="var(--accent-2)" />}
            </button>
          ))}
        </div>
      ) : (
        <div className="fp-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm">{selected}</span>
            <button onClick={() => setSelected(null)} className="text-xs" style={{ color: "var(--ink-soft)" }}>← К списку</button>
          </div>
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Описание техники</label>
          <textarea className="fp-input mb-3" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Как правильно выполнять упражнение…" />
          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Ссылка на видео (YouTube и т.п.)</label>
          <input className="fp-input mb-4" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/..." />
          <button className="fp-btn fp-btn-accent w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-40" disabled={busy} onClick={save}>
            <Save size={14} /> {busy ? "Сохраняем…" : saved ? "Сохранено ✓" : "Сохранить"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ КЛИЕНТ: ПРОСМОТР ------------------------------ */

export function ExerciseInfoPanel({ fullExerciseName }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const baseName = extractBaseExerciseName(fullExerciseName);

  useEffect(() => {
    setLoading(true);
    fetchExerciseDetail(baseName).then((d) => { setDetail(d); setLoading(false); }).catch(() => setLoading(false));
  }, [baseName]);

  if (loading || !detail || (!detail.description && !detail.video_url)) return null;

  return (
    <div className="fp-card p-3 mb-4" style={{ background: "var(--bg)" }}>
      <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
        <PlayCircle size={13} /> О ТЕХНИКЕ
      </div>
      {detail.description && <p className="text-xs mb-2">{detail.description}</p>}
      {detail.video_url && (
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 8, overflow: "hidden" }}>
          <iframe
            src={toEmbedUrl(detail.video_url)}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={baseName}
          />
        </div>
      )}
    </div>
  );
}
