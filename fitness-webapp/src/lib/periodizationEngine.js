// =============================================================================
// Ядро расчёта периодизации нагрузки — по алгоритму тренера.
// Формула Бжицки для 1ПМ, коэффициент честности, отдельные ветки расчёта для
// базовых / изолирующих / унилатеральных / ассистируемых упражнений.
// =============================================================================

// Коридор нагрузки (% от 1ПМ) по цели тренировочного блока.
export const GOAL_CORRIDORS = {
  "Сила": [75, 95],
  "Выносливость": [40, 60],
  "Гипертрофия": [65, 85],
  "Похудение": [60, 75],
  "Рекомпозиция": [65, 85],
  "Общий тонус": [50, 70],
  "Спортивная подготовка": [50, 90],
  "Реабилитация": [30, 60],
};
export const GOAL_OPTIONS = Object.keys(GOAL_CORRIDORS);

// Позиция каждого типа недели внутри коридора цели (0 = нижняя граница,
// 1 = верхняя). Разгрузка намеренно уходит НИЖЕ коридора.
const WEEK_POSITION = { light: 0.15, medium: 0.5, heavy: 1.0, deload: -0.4 };

export const WEEK_TYPE_META = {
  light: { label: "Лёгкая", color: "var(--accent-2)", clientNote: "Лёгкая неделя. Вес и объём — как база, без рекордов. Цель — плавно втянуться и наработать технику перед ростом нагрузки." },
  medium: { label: "Средняя", color: "#D9A441", clientNote: "Средняя неделя. Вес и число повторений немного выросли — начинаем нагружать сильнее, но без надрыва." },
  heavy: { label: "Тяжёлая", color: "var(--accent)", clientNote: "Тяжёлая неделя — пик блока. Вес заметно выше, повторений меньше. Это самая сложная неделя цикла, отдыхай между подходами как следует." },
  deload: { label: "Разгрузка", color: "var(--ink-soft)", clientNote: "Неделя разгрузки. Вес и объём специально снижены — это не отдых от тренировок, а часть плана: телу нужно восстановиться, чтобы дальше расти." },
};

// Коэффициент честности — защита от завышения 1ПМ по формуле Бжицки:
// чем больше повторений в подходе, тем менее надёжна оценка максимума.
function honestyCoefficient(reps) {
  if (reps <= 12) return 0.95;
  if (reps <= 15) return 0.90;
  return null; // 16+ — вне зоны 1ПМ, работаем линейной прогрессией
}

// Таблица %1ПМ → типичный диапазон повторений (для отображения клиенту/тренеру).
const PERCENT_TO_REPS = [
  [100, "1"], [95, "2"], [90, "3-4"], [85, "5-6"], [80, "7-8"],
  [75, "9-10"], [70, "11-12"], [65, "13-15"], [60, "16-20"], [50, "20-30+"],
];
export function repsRangeForPercent(pct) {
  let best = PERCENT_TO_REPS[PERCENT_TO_REPS.length - 1];
  for (const row of PERCENT_TO_REPS) {
    if (pct >= row[0]) { best = row; break; }
  }
  return best[1];
}

function brzycki1RM(weight, reps) {
  if (reps >= 37) return weight; // формула не определена, подстраховка
  return (weight * 36) / (37 - reps);
}
const roundDown = (value, step) => Math.floor(value / step) * step;
const roundUp = (value, step) => Math.ceil(value / step) * step;

// %1ПМ для конкретной недели — точка внутри коридора цели по типу недели.
export function targetPercentForWeek(goal, weekType) {
  const corridor = GOAL_CORRIDORS[goal] || GOAL_CORRIDORS["Гипертрофия"];
  const pos = WEEK_POSITION[weekType] ?? 0.5;
  const [min, max] = corridor;
  const pct = min + (max - min) * pos;
  return Math.max(30, Math.round(pct));
}

// Шаг округления веса по умолчанию для каждого типа упражнения (кг).
export const DEFAULT_STEP = { base: 2.5, isolation: 1, unilateral: 2, assisted: 5 };

// anchor = { weight, reps } — фактически выполненный подход (якорный), из
// которого считаются все дальнейшие недели. bodyWeight нужен только для
// ассистируемых упражнений (гравитрон и т.п.).
export function calcWeekTarget({ type, anchor, goal, weekType, bodyWeight, step }) {
  const st = step || DEFAULT_STEP[type] || 2.5;
  const pct = targetPercentForWeek(goal, weekType);
  const reps = repsRangeForPercent(pct);

  if (type === "base") {
    if (anchor.reps >= 16) {
      const delta = weekType === "heavy" ? st : weekType === "deload" ? -st : 0;
      return { weight: Math.max(0, anchor.weight + delta), reps, method: "linear" };
    }
    const k = honestyCoefficient(anchor.reps) ?? 0.95;
    const rm1 = brzycki1RM(anchor.weight, anchor.reps) * k;
    const target = rm1 * (pct / 100);
    return { weight: Math.max(0, roundDown(target, st)), reps, method: "1rm" };
  }

  if (type === "assisted") {
    const bw = bodyWeight || 70;
    const wReal = Math.max(1, bw - anchor.weight);
    const k = honestyCoefficient(anchor.reps) ?? 0.95;
    const rm1 = wReal * (36 / (37 - Math.min(anchor.reps, 30))) * k;
    const wTarget = rm1 * (pct / 100);
    const assistTarget = bw - wTarget;
    return { weight: Math.max(0, roundUp(assistTarget, st)), reps, method: "assisted" };
  }

  if (type === "isolation" || type === "unilateral") {
    const delta = weekType === "heavy" ? st : weekType === "deload" ? -st : 0;
    return { weight: Math.max(0, anchor.weight + delta), reps: null, method: "step" };
  }

  return { weight: anchor.weight, reps: null, method: "unchanged" };
}
