// =============================================================================
// Достижения и стрики — считаются на клиенте из уже загруженных данных
// (сессии, чек-ины, цели по упражнениям), закрепляются в БД при получении.
// =============================================================================

// Стрик — подряд идущих дней с хотя бы одной завершённой тренировкой.
// Сегодняшний день не обязателен (грейс-период), чтобы стрик не сгорал
// раньше времени, пока день ещё не закончился.
export function computeStreak(sessions) {
  const days = new Set(sessions.map((s) => new Date(s.finished_at).toISOString().slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  const todayKey = cursor.toISOString().slice(0, 10);
  if (!days.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export const ACHIEVEMENTS = [
  { key: "first_workout", title: "Первая тренировка", desc: "Завершите свою первую тренировку", icon: "Flag", check: (d) => d.sessions.length >= 1 },
  { key: "streak_7", title: "Неделя подряд", desc: "7 дней подряд с тренировкой", icon: "Flame", check: (d) => d.streak >= 7 },
  { key: "streak_30", title: "Месяц без пропусков", desc: "30 дней подряд с тренировкой", icon: "Zap", check: (d) => d.streak >= 30 },
  { key: "workouts_10", title: "10 тренировок", desc: "Завершите 10 тренировок", icon: "Dumbbell", check: (d) => d.sessions.length >= 10 },
  { key: "workouts_50", title: "50 тренировок", desc: "Завершите 50 тренировок", icon: "Medal", check: (d) => d.sessions.length >= 50 },
  { key: "workouts_100", title: "100 тренировок", desc: "Завершите 100 тренировок", icon: "Trophy", check: (d) => d.sessions.length >= 100 },
  { key: "first_checkin", title: "Первый чек-ин", desc: "Отправьте первый еженедельный чек-ин", icon: "ClipboardCheck", check: (d) => d.checkins.length >= 1 },
  { key: "checkins_10", title: "10 чек-инов", desc: "Регулярность на высоте — 10 чек-инов", icon: "TrendingUp", check: (d) => d.checkins.length >= 10 },
  { key: "goal_reached", title: "Цель достигнута", desc: "Дойдите до цели хотя бы по одному упражнению", icon: "Target", check: (d) => d.goalReached },
];

export function checkNewAchievements(data, alreadyEarnedKeys) {
  return ACHIEVEMENTS.filter((a) => !alreadyEarnedKeys.includes(a.key) && a.check(data));
}
