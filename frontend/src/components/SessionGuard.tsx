import { useCallback, useEffect, useState } from "react";
import { useMutation } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { TOUCH_SESSION } from "../graphql/mutations/auth";
import { setBackgroundRefreshHandler } from "../graphql/client";
import { IDLE_EXPIRE_MS, IDLE_WARN_MS, useIdleTimeout } from "../hooks/useIdleTimeout";
import SessionTimeoutDialog from "./SessionTimeoutDialog";

const PUBLIC_PATHS = ["/login", "/register", "/verify-otp"];
const COUNTDOWN_SEC = Math.round((IDLE_EXPIRE_MS - IDLE_WARN_MS) / 1000);
// Refresh the 15-min access token well before it can die under an active user.
const HEARTBEAT_MS = 10 * 60 * 1000;

export default function SessionGuard() {
  const { isAuthenticated, logout, ensureFreshToken } = useAuth();
  const [touchSession] = useMutation(TOUCH_SESSION);
  const [warning, setWarning] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const onPublicPath = PUBLIC_PATHS.some((p) => location.pathname.startsWith(p));

  const expire = useCallback(async () => {
    setWarning(false);
    await logout();
    navigate("/login?reason=session-expired", { replace: true });
  }, [logout, navigate]);

  // Keeps the backend `activity:user:{id}` clock fresh while the user is
  // genuinely active. Throttled to 1 call/min by the hook. Failures are
  // swallowed: a dead access token here must not log anyone out — the
  // expire timer and the errorLink remain the only logout paths.
  const touchBackend = useCallback(() => {
    touchSession().catch(() => {});
  }, [touchSession]);

  const { reset } = useIdleTimeout({
    enabled: isAuthenticated && !onPublicPath,
    onWarn: () => {
      setWarning(true);
      // The token is at least 4 min old here — renew proactively so Stay's
      // touchSession never goes out with a dead access token.
      void ensureFreshToken();
    },
    onExpired: () => void expire(),
    onActivityThrottled: touchBackend,
    touchThrottleMs: 60000,
  });

  const stay = useCallback(async () => {
    // Disarm the expire timer synchronously: an in-flight request must never
    // lose to the countdown.
    reset();
    try {
      await touchSession();
    } catch {
      // touchSession fails with "Not authenticated" when the access token
      // expired (>15 min session). One silent refresh + retry distinguishes
      // that from a true idle revocation before giving up.
      try {
        const refreshed = await ensureFreshToken();
        if (!refreshed) {
          await expire();
          return;
        }
        await touchSession();
      } catch {
        await expire();
        return;
      }
    }
    setWarning(false);
    reset();
  }, [touchSession, reset, expire, ensureFreshToken]);

  // SPA navigation (React Router) does not always produce a DOM event the
  // hook listens to (e.g. programmatic navigate after a mutation), yet it
  // is unambiguous user activity. Reset the timers and poke the backend
  // clock (fire-and-forget; same swallow rule as touchBackend).
  const pathname = location.pathname;
  useEffect(() => {
    if (!isAuthenticated || onPublicPath) return;
    reset();
    touchSession().catch(() => {});
  }, [pathname, isAuthenticated, onPublicPath, reset, touchSession]);

  // Background safety net: generic 401s (e.g. polls after token expiry)
  // trigger a silent refresh instead of a logout; only the exact backend
  // idle-revocation message forces logout (see client.ts errorLink).
  useEffect(() => {
    setBackgroundRefreshHandler(() => {
      void ensureFreshToken();
    });
    return () => setBackgroundRefreshHandler(null);
  }, [ensureFreshToken]);

  // Heartbeat keeps the access token alive for long active sessions so
  // background queries never 401 in the first place.
  useEffect(() => {
    if (!isAuthenticated || onPublicPath) return;
    const id = setInterval(() => {
      void ensureFreshToken();
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, onPublicPath, ensureFreshToken]);

  if (!isAuthenticated || onPublicPath) return null;
  return (
    <SessionTimeoutDialog
      open={warning}
      countdownSec={COUNTDOWN_SEC}
      onStay={() => void stay()}
      onLogout={() => void expire()}
    />
  );
}
