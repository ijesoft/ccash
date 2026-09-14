import { useCallback, useEffect, useRef } from "react";

const ACTIVITY_KEY = "ccash:lastActivity";
const EVENTS = ["mousemove", "keydown", "click", "touchstart", "scroll"] as const;

interface Options {
  enabled: boolean;
  warnAtMs?: number;
  expireAtMs?: number;
  onWarn: () => void;
  onExpired: () => void;
}

export const IDLE_WARN_MS = 4 * 60 * 1000;
export const IDLE_EXPIRE_MS = 5 * 60 * 1000;

export function useIdleTimeout({ enabled, warnAtMs = IDLE_WARN_MS, expireAtMs = IDLE_EXPIRE_MS, onWarn, onExpired }: Options) {
  const warnedRef = useRef(false);
  const timersRef = useRef<{ warn?: ReturnType<typeof setTimeout>; expire?: ReturnType<typeof setTimeout> }>({});
  const lastThrottleRef = useRef(0);
  const callbacksRef = useRef({ onWarn, onExpired });
  callbacksRef.current = { onWarn, onExpired };

  const clear = useCallback(() => {
    if (timersRef.current.warn) clearTimeout(timersRef.current.warn);
    if (timersRef.current.expire) clearTimeout(timersRef.current.expire);
    timersRef.current = {};
  }, []);

  const arm = useCallback(() => {
    clear();
    warnedRef.current = false;
    if (!enabled) return;
    timersRef.current.warn = setTimeout(() => {
      warnedRef.current = true;
      callbacksRef.current.onWarn();
    }, warnAtMs);
    timersRef.current.expire = setTimeout(() => {
      callbacksRef.current.onExpired();
    }, expireAtMs);
  }, [clear, enabled, warnAtMs, expireAtMs]);

  const reset = useCallback(() => {
    try {
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    } catch {}
    arm();
  }, [arm]);

  useEffect(() => {
    if (!enabled) {
      clear();
      return;
    }
    arm();

    const onActivity = () => {
      const now = Date.now();
      if (now - lastThrottleRef.current < 1000) return;
      lastThrottleRef.current = now;
      reset();
    };
    const onExternal = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY) arm();
    };

    EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    window.addEventListener("storage", onExternal);
    return () => {
      EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.removeEventListener("storage", onExternal);
      clear();
    };
  }, [enabled, arm, reset, clear]);

  return { reset };
}
