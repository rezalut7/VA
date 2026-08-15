import React, { useState, useEffect } from "react";
import { BookOpen, Save, Video, Search, PlayCircle, Upload, X } from "lucide-react";
import { EXERCISE_GROUPS } from "../data/exerciseGroups";
import { fetchAllExerciseDetails, fetchExerciseDetail, upsertExerciseDetail, uploadExerciseVideo } from "../lib/api";

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

// Старые записи могли ссылаться на YouTube — оставляем совместимость и для них,
// но новая загрузка всегда идёт на наш собственный Supabase Storage (прямой файл).
function isDirectVideoFile(url) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) || url.includes("supabase.co/storage");
}
function toYoutubeEmbedUrl(url) {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]+)/);
  return yt ? `https://www.youtube.com/embed/${yt[1]}` : url;
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = () => { setLoading(true); fetchAllExerciseDetails().then((d) => { setDetails(d); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const names = allBaseExerciseNames().filter((n) => n.toLowerCase().includes(query.toLowerCase()));

  const pick = (name) => {
    setSelected(name);
    setSaved(false);
    setUploadError("");
    const existing = details[name];
    setDescription(existing?.description || "");
    setVideoUrl(existing?.video_url || "");
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      const url = await uploadExerciseVideo(file);
      setVideoUrl(url);
    } catch (err) {
      setUploadError("Не удалось загрузить видео — проверьте размер файла и подключение.");
    }
    setUploading(false);
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
        Видео загружается к нам на сервер, отдельный аккаунт на YouTube не нужен.
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
              {details[n]?.video_url && <Video size={13} color="var(--accent-2)" />}
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
          <textarea className="fp-input mb-4" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Как правильно выполнять упражнение…" />

          <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Видео</label>
          {videoUrl ? (
            <div className="mb-3">
              {isDirectVideoFile(videoUrl) ? (
                <video src={videoUrl} controls style={{ width: "100%", borderRadius: 8, maxHeight: 220 }} />
              ) : (
                <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 8, overflow: "hidden" }}>
                  <iframe src={toYoutubeEmbedUrl(videoUrl)} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }} allowFullScreen title={selected} />
                </div>
              )}
              <button className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "var(--danger)" }} onClick={() => setVideoUrl("")}>
                <X size={12} /> Убрать видео
              </button>
            </div>
          ) : (
            <label className="fp-btn fp-btn-outline w-full py-3 mb-3 flex items-center justify-center gap-2 cursor-pointer" style={{ opacity: uploading ? 0.5 : 1 }}>
              <Upload size={15} /> {uploading ? "Загружаем…" : "Загрузить видео с компьютера"}
              <input type="file" accept="video/*" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
            </label>
          )}
          {uploadError && <p className="text-xs mb-3" style={{ color: "var(--danger)" }}>{uploadError}</p>}

          <button className="fp-btn fp-btn-accent w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-40" disabled={busy || uploading} onClick={save}>
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
        isDirectVideoFile(detail.video_url) ? (
          <video src={detail.video_url} controls playsInline style={{ width: "100%", borderRadius: 8, maxHeight: 240 }} />
        ) : (
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 8, overflow: "hidden" }}>
            <iframe
              src={toYoutubeEmbedUrl(detail.video_url)}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={baseName}
            />
          </div>
        )
      )}
    </div>
  );
}
