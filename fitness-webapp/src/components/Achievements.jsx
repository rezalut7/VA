import React, { useState, useEffect } from "react";
import { Flame, X, Lock, Flag, Zap, Dumbbell, Medal, Trophy, ClipboardCheck, TrendingUp, Target } from "lucide-react";
import { fetchSessionsForClient, fetchCheckins, fetchExerciseGoals, fetchClientAchievements, addClientAchievement } from "../lib/api";
import { computeStreak, ACHIEVEMENTS, checkNewAchievements } from "../lib/achievements";
import { computeExerciseStats } from "./ExerciseProgress";

const ICONS = { Flag, Flame, Zap, Dumbbell, Medal, Trophy, ClipboardCheck, TrendingUp, Target };

// Плоский цвет, тонкая обводка, мягкая тень одним оттенком — без градиентов
// и color-mix(), которые на части устройств рендерятся с полосами/артефактами.
// Достижение читается по чёткому силуэту иконки, а не по эффектам.
function Medallion({ achievement, earned, size = 68 }) {
  const Icon = ICONS[achievement.icon];
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: size, height: size, borderRadius: "50%", position: "relative",
        background: earned ? "var(--accent)" : "var(--surface)",
        border: earned ? "none" : "2px solid var(--line)",
        boxShadow: earned ? "0 4px 10px rgba(0,0,0,0.18)" : "none",
      }}
    >
      <Icon size={size * 0.42} color={earned ? "var(--accent-ink)" : "var(--ink-soft)"} strokeWidth={2.25} />
      {!earned && (
        <div
          className="flex items-center justify-center"
          style={{
            position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: "50%",
            background: "var(--solid-dark)", border: "2px solid var(--bg)",
          }}
        >
          <Lock size={10} color="#fff" />
        </div>
      )}
    </div>
  );
}

export function AchievementsSection({ client }) {
  const [streak, setStreak] = useState(0);
  const [earnedKeys, setEarnedKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [celebrating, setCelebrating] = useState(null);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const [sessions, checkins, goals, achievements] = await Promise.all([
        fetchSessionsForClient(client.id),
        fetchCheckins(client.id),
        fetchExerciseGoals(client.id),
        fetchClientAchievements(client.id),
      ]);

      const goalReached = goals.some((g) => {
        const points = computeExerciseStats(sessions, g.exercise_name);
        const best = points.length > 0 ? Math.max(...points.map((p) => (g.metric === "max_weight" ? p.maxWeight : p.maxReps))) : 0;
        return best >= g.target_value;
      });

      const currentStreak = computeStreak(sessions);
      setStreak(currentStreak);

      const alreadyKeys = achievements.map((a) => a.achievement_key);
      const newlyEarned = checkNewAchievements({ sessions, checkins, streak: currentStreak, goalReached }, alreadyKeys);

      if (newlyEarned.length > 0) {
        await Promise.all(newlyEarned.map((a) => addClientAchievement(client.id, a.key)));
        setCelebrating(newlyEarned[0]);
      }

      setEarnedKeys([...alreadyKeys, ...newlyEarned.map((a) => a.key)]);
      setLoading(false);
    })();
  }, [client.id]);

  if (loading) return null;

  const earnedCount = ACHIEVEMENTS.filter((a) => earnedKeys.includes(a.key)).length;

  return (
    <div className="fp-card p-4 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <Flame size={18} color={streak > 0 ? "var(--accent)" : "var(--ink-soft)"} />
          <span className="fp-display font-semibold">{streak} {streak === 1 ? "день" : streak >= 2 && streak <= 4 ? "дня" : "дней"} подряд</span>
        </div>
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{earnedCount} из {ACHIEVEMENTS.length}</span>
      </div>

      <div className="flex gap-4 overflow-x-auto fp-scroll pb-1" style={{ scrollSnapType: "x mandatory" }}>
        {ACHIEVEMENTS.map((a) => {
          const earned = earnedKeys.includes(a.key);
          return (
            <div key={a.key} className="flex flex-col items-center text-center" style={{ width: 78, scrollSnapAlign: "start" }} title={a.desc}>
              <Medallion achievement={a} earned={earned} />
              <span className="text-[10px] mt-2 font-semibold" style={{ color: earned ? "var(--ink)" : "var(--ink-soft)" }}>{a.title}</span>
            </div>
          );
        })}
      </div>

      {celebrating && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", zIndex: 60 }}>
          <div className="fp-card p-6 w-full max-w-xs text-center" style={{ background: "var(--surface)" }}>
            <button type="button" onClick={() => setCelebrating(null)} className="float-right"><X size={18} color="var(--ink-soft)" /></button>
            <div className="flex justify-center mb-3">
              <Medallion achievement={celebrating} earned size={88} />
            </div>
            <div className="fp-display text-lg font-bold mb-1">Новое достижение!</div>
            <div className="text-sm font-semibold mb-1">{celebrating.title}</div>
            <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>{celebrating.desc}</p>
            <button type="button" className="fp-btn fp-btn-accent w-full py-2 text-sm" onClick={() => setCelebrating(null)}>Круто!</button>
          </div>
        </div>
      )}
    </div>
  );
}
