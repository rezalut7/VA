import React, { useState, useEffect } from "react";
import { Flame, X } from "lucide-react";
import { fetchSessionsForClient, fetchCheckins, fetchExerciseGoals, fetchClientAchievements, addClientAchievement } from "../lib/api";
import { computeStreak, ACHIEVEMENTS, checkNewAchievements } from "../lib/achievements";
import { computeExerciseStats } from "./ExerciseProgress";

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

  return (
    <div className="fp-card p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Flame size={16} color={streak > 0 ? "var(--accent)" : "var(--ink-soft)"} />
          <span className="fp-display font-semibold">{streak} {streak === 1 ? "день" : streak >= 2 && streak <= 4 ? "дня" : "дней"} подряд</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {ACHIEVEMENTS.map((a) => {
          const earned = earnedKeys.includes(a.key);
          return (
            <div key={a.key} className="flex flex-col items-center text-center" title={a.desc}>
              <div
                className="flex items-center justify-center mb-1"
                style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: earned ? "var(--bg)" : "var(--line)",
                  border: earned ? "2px solid var(--accent-2)" : "2px solid var(--line)",
                  fontSize: 20, opacity: earned ? 1 : 0.35,
                }}
              >{a.icon}</div>
              <span className="text-[10px]" style={{ color: earned ? "var(--ink)" : "var(--ink-soft)" }}>{a.title}</span>
            </div>
          );
        })}
      </div>

      {celebrating && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(22,32,42,0.6)", zIndex: 60 }}>
          <div className="fp-card p-6 w-full max-w-xs text-center" style={{ background: "var(--surface)" }}>
            <button onClick={() => setCelebrating(null)} className="float-right"><X size={18} color="var(--ink-soft)" /></button>
            <div style={{ fontSize: 48 }} className="mb-2">{celebrating.icon}</div>
            <div className="fp-display text-lg font-bold mb-1">Новое достижение!</div>
            <div className="text-sm font-semibold mb-1">{celebrating.title}</div>
            <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>{celebrating.desc}</p>
            <button className="fp-btn fp-btn-accent w-full py-2 text-sm" onClick={() => setCelebrating(null)}>Круто!</button>
          </div>
        </div>
      )}
    </div>
  );
}
