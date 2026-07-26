import { useCallback, useEffect, useState } from "react";

export type CameraPermissionState = "unknown" | "prompt" | "granted" | "denied" | "unsupported" | "insecure";

export function useCameraPermission() {
  const [state, setState] = useState<CameraPermissionState>("unknown");

  const refresh = useCallback(async () => {
    if (!window.isSecureContext) {
      setState("insecure");
      return "insecure" as const;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return "unsupported" as const;
    }

    try {
      if (navigator.permissions?.query) {
        const result = await navigator.permissions.query({ name: "camera" as PermissionName });
        const next = result.state as CameraPermissionState;
        setState(next);
        result.onchange = () => setState(result.state as CameraPermissionState);
        return next;
      }
    } catch {
      // Some browsers (notably Safari) don't support camera permission queries.
    }

    setState("prompt");
    return "prompt" as const;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const request = useCallback(async () => {
    if (!window.isSecureContext) {
      setState("insecure");
      throw new Error("Camera requires HTTPS or localhost.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      throw new Error("Camera is not supported on this device.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    stream.getTracks().forEach((track) => track.stop());
    setState("granted");
    return "granted" as const;
  }, []);

  return { state, refresh, request };
}
