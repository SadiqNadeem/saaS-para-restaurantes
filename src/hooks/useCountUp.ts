import { useEffect, useState } from "react";

/**
 * Animates a number from 0 to `target` over `duration` ms.
 * Only starts when `isActive` is true (tie to scroll visibility).
 */
export function useCountUp(target: number, duration = 1600, isActive = true): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    let startTime: number | null = null;
    let raf: number;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, isActive]);

  return count;
}
