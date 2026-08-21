import { useRef } from "react";

// Простой свайп-детектор на touch-событиях — без сторонних библиотек.
// Возвращает обработчики, которые вешаются прямо на нужный контейнер:
//   const swipe = useSwipe({ onSwipeLeft: next, onSwipeRight: back });
//   <div {...swipe}>...</div>
// threshold — минимальное смещение по X, чтобы засчитать как свайп (px).
// Проверяем, что движение преимущественно горизонтальное (не вертикальный
// скролл), иначе обычная прокрутка списка воспринималась бы как свайп.
export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 50 } = {}) {
  const startX = useRef(null);
  const startY = useRef(null);

  const onTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  };

  const onTouchEnd = (e) => {
    if (startX.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;
    startX.current = null;
    if (Math.abs(dx) < threshold) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.3) return; // это был вертикальный скролл, а не свайп
    if (dx < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  };

  return { onTouchStart, onTouchEnd };
}
