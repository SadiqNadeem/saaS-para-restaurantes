import { useEffect, useState } from "react";
import { useAnimatedPresence } from "./useAnimatedPresence";

export function useAnimatedValue<T>(value: T | null, durationMs = 220) {
  const [displayValue, setDisplayValue] = useState<T | null>(value);
  const presence = useAnimatedPresence(Boolean(value), durationMs);

  useEffect(() => {
    if (value) {
      setDisplayValue(value);
      return;
    }
    if (!presence.mounted) {
      setDisplayValue(null);
    }
  }, [presence.mounted, value]);

  return {
    displayValue,
    mounted: presence.mounted,
    visible: presence.visible,
  };
}
