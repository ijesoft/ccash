import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import CameraswitchIcon from "@mui/icons-material/Cameraswitch";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import QrScanner from "qr-scanner";
import qrScannerWorkerPath from "qr-scanner/qr-scanner-worker.min.js?url";
import { useCameraPermission } from "../hooks/useCameraPermission";

QrScanner.WORKER_PATH = qrScannerWorkerPath;

interface Props {
  active: boolean;
  onScan: (payload: string) => void;
}

export default function QrCameraScanner({ active, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const lastScanRef = useRef("");
  const { state, request } = useCameraPermission();
  const [starting, setStarting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    QrScanner.hasCamera().then((ok) => {
      if (!cancelled) setHasCamera(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      scannerRef.current?.stop();
      setScanning(false);
      return;
    }
    return () => {
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
      scannerRef.current = null;
      setScanning(false);
    };
  }, [active]);

  const startCamera = async () => {
    setError("");
    setStarting(true);
    try {
      if (state === "prompt" || state === "unknown") {
        await request();
      }
      if (!videoRef.current) return;

      if (!scannerRef.current) {
        scannerRef.current = new QrScanner(
          videoRef.current,
          (result) => {
            const data = typeof result === "string" ? result : result.data;
            if (!data || data === lastScanRef.current) return;
            lastScanRef.current = data;
            onScan(data);
            // Allow rescan of the same code after a short cooldown.
            window.setTimeout(() => {
              if (lastScanRef.current === data) lastScanRef.current = "";
            }, 2500);
          },
          {
            returnDetailedScanResult: true,
            highlightScanRegion: true,
            highlightCodeOutline: true,
            preferredCamera: "environment",
            maxScansPerSecond: 5,
          },
        );
      }

      await scannerRef.current.start();
      setScanning(true);
    } catch (err: any) {
      const message = String(err?.message || err || "");
      if (/NotAllowedError|Permission denied|PermissionDismissed/i.test(message)) {
        setError("Camera permission was denied. Enable camera access for CCash in your browser or system settings, then try again.");
      } else if (/NotFoundError|DevicesNotFound/i.test(message)) {
        setError("No camera was found on this device.");
      } else if (/NotReadableError|TrackStartError/i.test(message)) {
        setError("Camera is already in use by another app. Close it and try again.");
      } else if (!window.isSecureContext) {
        setError("Camera access requires HTTPS (or localhost). Open CCash over a secure connection to scan QR codes.");
      } else {
        setError(message || "Unable to start the camera.");
      }
      setScanning(false);
    } finally {
      setStarting(false);
    }
  };

  const stopCamera = () => {
    scannerRef.current?.stop();
    setScanning(false);
  };

  if (hasCamera === false) {
    return (
      <Alert severity="info" sx={{ borderRadius: 2, mb: 2 }}>
        No camera detected. You can still paste a QR payload below.
      </Alert>
    );
  }

  return (
    <Box sx={{ mb: 2 }}>
      {state === "insecure" && (
        <Alert severity="warning" sx={{ borderRadius: 2, mb: 2 }}>
          Camera requires a secure context (HTTPS or localhost). Native install/prompt and camera scanning will not work over plain HTTP on a LAN host.
        </Alert>
      )}

      {state === "denied" && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>
          Camera permission is blocked. On iPhone: Settings → Safari → Camera. On Android Chrome: Site settings → Camera → Allow.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          position: "relative",
          borderRadius: 3,
          overflow: "hidden",
          bgcolor: "#0b1220",
          aspectRatio: "3 / 4",
          maxHeight: { xs: "52vh", sm: 420 },
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          component="video"
          ref={videoRef}
          muted
          playsInline
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: scanning ? "block" : "none",
          }}
        />

        {!scanning && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1.5,
              px: 3,
              textAlign: "center",
              color: "white",
            }}
          >
            <VideocamOffIcon sx={{ fontSize: 40, opacity: 0.8 }} />
            <Typography variant="subtitle1" fontWeight={700}>
              Scan a CCash QR code
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              We only use your camera to read the QR payload. Nothing is recorded.
            </Typography>
            <Button
              variant="contained"
              startIcon={starting ? <CircularProgress size={16} color="inherit" /> : <CameraswitchIcon />}
              onClick={startCamera}
              disabled={starting || state === "insecure" || state === "unsupported"}
              sx={{ mt: 1, minHeight: 48 }}
            >
              {starting ? "Starting camera..." : "Allow camera & scan"}
            </Button>
          </Box>
        )}

        {scanning && (
          <Box
            sx={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              p: 1.5,
              background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 1,
            }}
          >
            <Typography variant="caption" sx={{ color: "white" }}>
              Point at a QR code
            </Typography>
            <Button size="small" variant="outlined" onClick={stopCamera} sx={{ color: "white", borderColor: "rgba(255,255,255,0.5)" }}>
              Stop
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
