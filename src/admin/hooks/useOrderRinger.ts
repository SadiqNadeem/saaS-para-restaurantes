import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrderStatus } from "../../constants/orderStatus";

type OrderLike = {
  status: OrderStatus | null;
};

type UseOrderRingerParams = {
  restaurantId: string;
  orders: OrderLike[];
};

const SOUND_ENABLED_KEY = "admin_sound_enabled";

export function isPendingOrderStatus(status: OrderStatus | null | undefined) {
  return status === "pending";
}

export function useOrderRinger({ restaurantId, orders }: UseOrderRingerParams) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [cycleMuted, setCycleMuted] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);

  const ringIntervalRef = useRef<number | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const soundEnabledRef = useRef(false);
  const cycleMutedRef = useRef(false);

  const pendingCount = useMemo(
    () => orders.filter((order) => isPendingOrderStatus(order.status)).length,
    [orders]
  );

  const playOnce = useCallback(async () => {
    const audio = new Audio("/new-order.mp3");
    audio.volume = 1.0;
    audio.currentTime = 0;
    await audio.play();
  }, []);

  const stopRing = useCallback(() => {
    if (ringIntervalRef.current !== null) {
      window.clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch {
        // ignore
      }
      currentAudioRef.current = null;
    }
    setIsRinging(false);
  }, []);

  const startRing = useCallback(() => {
    if (ringIntervalRef.current !== null) {
      return;
    }

    if (!soundEnabledRef.current || cycleMutedRef.current) {
      return;
    }

    setIsRinging(true);

    const tick = () => {
      if (!soundEnabledRef.current || cycleMutedRef.current) {
        return;
      }

      const audio = new Audio("/new-order.mp3");
      currentAudioRef.current = audio;
      audio.volume = 1.0;
      audio.currentTime = 0;
      void audio.play().catch((error) => {
        const message = String(
          (error as { message?: unknown })?.message ?? "No se pudo reproducir sonido"
        );
        setSoundError(message);
      });
    };

    tick();
    ringIntervalRef.current = window.setInterval(tick, 3000);
  }, []);

  const enableSound = useCallback(async () => {
    try {
      await playOnce();
      localStorage.setItem(SOUND_ENABLED_KEY, "1");
      setSoundEnabled(true);
      setSoundError(null);
    } catch (error) {
      const message = String(
        (error as { message?: unknown })?.message ?? "No se pudo activar sonido"
      );
      setSoundError(message);
    }
  }, [playOnce]);

  const playTestSound = useCallback(async () => {
    if (!soundEnabled) {
      return;
    }
    try {
      await playOnce();
      setSoundError(null);
    } catch (error) {
      const message = String(
        (error as { message?: unknown })?.message ?? "No se pudo reproducir sonido"
      );
      setSoundError(message);
    }
  }, [playOnce, soundEnabled]);

  const muteCycle = useCallback(() => {
    setCycleMuted(true);
    stopRing();
  }, [stopRing]);

  const resetCycleMute = useCallback(() => {
    setCycleMuted(false);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(SOUND_ENABLED_KEY);
    setSoundEnabled(saved === "1");
    setCycleMuted(false);
    stopRing();
  }, [restaurantId, stopRing]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    cycleMutedRef.current = cycleMuted;
  }, [cycleMuted]);

  useEffect(() => {
    console.info(
      "[ringer] enabled=",
      soundEnabled,
      "pending=",
      pendingCount,
      "muted=",
      cycleMuted,
      "isRinging=",
      isRinging
    );
  }, [cycleMuted, isRinging, pendingCount, soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) {
      stopRing();
      return;
    }

    if (pendingCount > 0 && !cycleMuted) {
      startRing();
      return;
    }

    if (pendingCount === 0) {
      stopRing();
      setCycleMuted(false);
      return;
    }

    stopRing();
  }, [cycleMuted, pendingCount, soundEnabled, startRing, stopRing]);

  useEffect(() => {
    return () => {
      stopRing();
    };
  }, [stopRing]);

  return {
    soundEnabled,
    cycleMuted,
    isRinging,
    pendingCount,
    soundError,
    enableSound,
    playTestSound,
    startRing,
    stopRing,
    muteCycle,
    resetCycleMute,
  };
}
