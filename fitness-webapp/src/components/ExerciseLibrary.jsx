import React, { useState, useEffect } from "react";
import { BookOpen, Save, Video, Search, PlayCircle, Upload, X, Info } from "lucide-react";
import { EXERCISE_GROUPS } from "../data/exerciseGroups";
import { fetchAllExerciseDetails, fetchExerciseDetail, upsertExerciseDetail, uploadExerciseVideo } from "../lib/api";

// Рекомендуемый формат для загрузки видео — показывается тренеру и упоминается тут для справки:
export const VIDEO_UPLOAD_GUIDE = {
  aspectRatio: "1:1 (квадрат)",
  resolution: "1080×1080 px",
  format: "MP4 (H.264)",
  maxSizeMB: 50,
  maxDurationSec: 45,
};

// Список базовых упражнений (без снаряда/варианта) — для выбора в редакторе.
export function allBaseExerciseNames() {
  const names = new Set();
  EXERCISE_GROUPS.forEach((g) => g.exercises.forEach((e) => names.add(e.name)));
  return [...names].sort();
}

// Список вариантов снаряда для конкретного базового упражнения (может встречаться
// в нескольких группах с разными списками — объединяем).
export function equipmentOptionsFor(baseName) {
  const opts = new Set();
  EXERCISE_GROUPS.forEach((g) => g.exercises.forEach((e) => {
    if (e.name === baseName) e.equipment.forEach((eq) => opts.add(eq));
  }));
  return [...opts];
}

// Ключ в exercise_details: "Упражнение — Снаряд" для конкретной вариации,
// либо просто "Упражнение", если вариаций нет или выбрано "Общее".
export function detailKey(baseName, equipment) {
  return equipment ? `${baseName} — ${equipment}` : baseName;
}

// Полное название в тренировке — "Группа - Упражнение - Снаряд - Вариант"
// (либо только "Группа - Упражнение - Вариант", если у упражнения нет снаряда —
// тогда вариант "сдвигается" на место снаряда). Пробуем все правдоподобные
// ключи по очереди, с общим названием как последним запасным вариантом.
export function extractDetailKeys(fullName) {
  const parts = (fullName || "").split(" - ");
  const base = parts.length >= 2 ? parts[1] : fullName;
  const keys = [];
  if (parts[2]) keys.push(detailKey(base, parts[2]));
  if (parts[3]) keys.push(detailKey(base, parts[3]));
  keys.push(base);
  return keys;
}

function isDirectVideoFile(url) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) || url.includes("supabase.co/storage");
}
function toYoutubeEmbedUrl(url) {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]+)/);
  return yt ? `https://www.youtube.com/embed/${yt[1]}` : url;
}

// Квадратный плеер 1:1 — единый для тренера и клиента, playsInline обязателен
// для iOS (иначе видео открывается на весь экран поверх страницы), preload
// metadata — чтобы не грузить весь файл на мобильном интернете сразу.
function SquareVideoPlayer({ src, title }) {
  if (isDirectVideoFile(src)) {
    return (
      <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: "#000" }}>
        <video
          src={src}
          controls
          playsInline
          preload="metadata"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }
  return (
    <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden" }}>
      <iframe
        src={toYoutubeEmbedUrl(src)}
        style={{ width: "100%", height: "100%", border: "none" }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={title}
      />
    </div>
  );
}

/* ------------------------------ ТРЕНЕР: РЕДАКТОР ------------------------------ */

const GENERAL_KEY = "__general__";

export function ExerciseLibraryManager() {
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [selectedEquipment, setSelectedEquipment] = useState(GENERAL_KEY);
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = () => { setLoading(true); fetchAllExerciseDetails().then((d) => { setDetails(d); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const names = allBaseExerciseNames().filter((n) => n.toLowerCase().includes(query.toLowerCase()));
  const equipmentOptions = selectedExercise ? equipmentOptionsFor(selectedExercise) : [];

  const loadFields = (exercise, equipment) => {
    const key = equipment === GENERAL_KEY ? detailKey(exercise, null) : detailKey(exercise, equipment);
    const existing = details[key];
    setDescription(existing?.description || "");
    setVideoUrl(existing?.video_url || "");
  };

  const pickExercise = (name) => {
    setSelectedExercise(name);
    setSelectedEquipment(GENERAL_KEY);
    setSaved(false);
    setUploadError("");
    loadFields(name, GENERAL_KEY);
  };

  const pickEquipment = (eq) => {
    setSelectedEquipment(eq);
    setSaved(false);
    setUploadError("");
    loadFields(selectedExercise, eq);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    if (file.size > VIDEO_UPLOAD_GUIDE.maxSizeMB * 1024 * 1024) {
      setUploadError(`Файл больше ${VIDEO_UPLOAD_GUIDE.maxSizeMB} МБ — сожмите видео и попробуйте снова.`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadExerciseVideo(file);
      setVideoUrl(url);
    } catch (err) {
      setUploadError("Не удалось загрузить видео — проверьте подключение и попробуйте снова.");
    }
    setUploading(false);
  };

  const save = async () => {
    if (!selectedExercise) return;
    setBusy(true);
    const key = selectedEquipment === GENERAL_KEY ? detailKey(selectedExercise, null) : detailKey(selectedExercise, selectedEquipment);
    await upsertExerciseDetail(key, description.trim(), videoUrl.trim());
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
      <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
        Описание и видео можно задать отдельно на каждый снаряд — «Приседания со штангой» и
        «Приседания в Смите» могут иметь разные ролики.
      </p>

      <div className="fp-card p-3 mb-4 flex items-start gap-2" style={{ background: "var(--bg)" }}>
        <Info size={14} color="var(--ink-soft)" style={{ marginTop: 1, flexShrink: 0 }} />
        <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
          Формат видео: квадрат {VIDEO_UPLOAD_GUIDE.aspectRatio}, {VIDEO_UPLOAD_GUIDE.resolution}, {VIDEO_UPLOAD_GUIDE.format},
          {" "}до {VIDEO_UPLOAD_GUIDE.maxSizeMB} МБ, ролик короче {VIDEO_UPLOAD_GUIDE.maxDurationSec} сек — грузится быстро на мобильном интернете.
        </div>
      </div>

      {!selectedExercise ? (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Search size={15} color="var(--ink-soft)" />
            <input className="fp-input" placeholder="Найти упражнение…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Загрузка…</p>
          ) : (
            <div className="fp-card fp-scroll" style={{ maxHeight: 400, overflowY: "auto" }}>
              {names.map((n) => {
                const hasAny = Object.keys(details).some((k) => k === n || k.startsWith(`${n} — `));
                return (
                  <button key={n} onClick={() => pickExercise(n)} className="w-full text-left px-3 py-2.5 text-sm border-b last:border-0 flex items-center justify-between" style={{ borderColor: "var(--line)" }}>
                    <span>{n}</span>
                    {hasAny && <Video size={13} color="var(--accent-2)" />}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="fp-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm">{selectedExercise}</span>
            <button onClick={() => setSelectedExercise(null)} className="text-xs" style={{ color: "var(--ink-soft)" }}>← К списку</button>
          </div>

          {equipmentOptions.length > 0 && (
            <div className="mb-4">
              <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Вариация (снаряд)</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => pickEquipment(GENERAL_KEY)}
                  className="fp-card px-2.5 py-1.5 text-xs"
                  style={{ borderColor: selectedEquipment === GENERAL_KEY ? "var(--accent)" : "var(--line)", borderWidth: selectedEquipment === GENERAL_KEY ? 1.5 : 1 }}
                >Общее (все варианты)</button>
                {equipmentOptions.map((eq) => (
                  <button
                    key={eq}
                    onClick={() => pickEquipment(eq)}
                    className="fp-card px-2.5 py-1.5 text-xs"
                    style={{ borderColor: selectedEquipment === eq ? "var(--accent)" : "var(--line)", borderWidth: selectedEquipment === eq ? 1.5 : 1 }}
                  >{eq}</button>
                ))}
              </div>
            </div>
          )}

          <label className="text-xs mb-1 block" style={{ color: "var(--ink-soft)" }}>Описание техники</label>
          <textarea className="fp-input mb-4" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Как правильно выполнять упражнение…" />

          <label className="text-xs mb-1.5 block" style={{ color: "var(--ink-soft)" }}>Видео</label>
          {videoUrl ? (
            <div className="mb-3" style={{ maxWidth: 280 }}>
              <SquareVideoPlayer src={videoUrl} title={selectedExercise} />
              <button className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "var(--danger)" }} onClick={() => setVideoUrl("")}>
                <X size={12} /> Убрать видео
              </button>
            </div>
          ) : (
            <label className="fp-btn fp-btn-outline w-full py-3 mb-3 flex items-center justify-center gap-2 cursor-pointer" style={{ opacity: uploading ? 0.5 : 1 }}>
              <Upload size={15} /> {uploading ? "Загружаем…" : "Загрузить видео с телефона"}
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

// Разбивает описание на абзацы Подготовка/Движение/Контроль. Основной способ —
// по пустой строке между ними; если в тексте пустых строк нет (например, слепили
// в одну строку), режем прямо перед метками, чтобы разбивка не терялась.
function splitDescriptionParagraphs(text) {
  if (!text) return [];
  let parts = text.split(/\r?\n\s*\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) return parts;
  parts = text.split(/(?=(?:Подготовка|Движение|Контроль):)/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [text.trim()];
}

// Общий хук — тянет описание/видео для конкретного упражнения (с учётом снаряда,
// см. extractDetailKeys), используется и для блока описания, и для блока видео,
// чтобы не делать по два одинаковых запроса.
export function useExerciseDetail(fullExerciseName) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const keys = extractDetailKeys(fullExerciseName);
    (async () => {
      for (const key of keys) {
        try {
          const d = await fetchExerciseDetail(key);
          if (d && (d.description || d.video_url)) { setDetail(d); setLoading(false); return; }
        } catch (e) { /* try next key */ }
      }
      setDetail(null);
      setLoading(false);
    })();
  }, [fullExerciseName]);

  return { detail, loading };
}

export function ExerciseDescriptionBlock({ detail, loading }) {
  const [open, setOpen] = useState(false);
  if (loading || !detail || !detail.description) return null;
  return (
    <div className="fp-card p-2.5 mb-3" style={{ background: "var(--bg)" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-1.5 text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
        <span className="flex items-center gap-1.5"><PlayCircle size={13} /> О ТЕХНИКЕ</span>
        <span style={{ color: "var(--accent)" }}>{open ? "Скрыть ▲" : "Показать ▼"}</span>
      </button>
      {open && (
        <div className="space-y-1.5 mt-2">
          {splitDescriptionParagraphs(detail.description).map((para, i) => {
            const m = para.match(/^(Подготовка|Движение|Контроль):\s*([\s\S]*)$/);
            return (
              <p key={i} className="text-xs">
                {m ? <><b>{m[1]}:</b> {m[2]}</> : para}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ExerciseVideoBlock({ detail, loading, title }) {
  const [open, setOpen] = useState(false);
  if (loading || !detail || !detail.video_url) return null;
  return (
    <div className="fp-card p-2.5 mb-3" style={{ background: "var(--bg)" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-1.5 text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
        <span className="flex items-center gap-1.5"><Video size={13} /> ВИДЕО</span>
        <span style={{ color: "var(--accent)" }}>{open ? "Скрыть ▲" : "Показать ▼"}</span>
      </button>
      {open && (
        <div className="mt-2" style={{ maxWidth: 280, margin: "8px auto 0" }}>
          <SquareVideoPlayer src={detail.video_url} title={title} />
        </div>
      )}
    </div>
  );
}

// Обёртка "всё вместе" — оставлена для мест, где порядок описание+видео не важен.
export function ExerciseInfoPanel({ fullExerciseName }) {
  const { detail, loading } = useExerciseDetail(fullExerciseName);
  return (
    <>
      <ExerciseDescriptionBlock detail={detail} loading={loading} />
      <ExerciseVideoBlock detail={detail} loading={loading} title={fullExerciseName} />
    </>
  );
}
