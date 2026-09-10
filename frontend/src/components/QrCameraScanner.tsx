import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import CameraswitchIcon from "@mui/icons-material/Cameraswitch";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import QrScanner from "qr-scanner";
import { useCameraPermission } from "../hooks/useCameraPermission";
import { configureQrScannerForReliability, decodeQrFromFile } from "../utils/decodeQr";

configureQrScannerForReliability();

interface Props {
  active: boolean;
  onScan: (payload: string) => void;
}

export default function QrCameraScanner({ active, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const lastScanRef = useRef("");
  const onScanRef = useRef(onScan);
  const { state } = useCameraPermission();
  const [starting, setStarting] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [error, setError] = useState("");
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const autoStartedRef = useRef(false);

  const cameraBlocked = state === "insecure" || state === "unsupported" || state === "denied";

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let cancelled = false;
    QrScanner.hasCamera()
      .then((ok) => {
        if (!cancelled) setHasCamera(ok);
      })
      .catch(() => {
        if (!cancelled) setHasCamera(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      scannerRef.current?.stop();
      setPreviewActive(false);
      autoStartedRef.current = false;
      return;
    }
    return () => {
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
      scannerRef.current = null;
      setPreviewActive(false);
    };
  }, [active]);

  const emitScan = (data: string) => {
    const payload = data.trim();
    if (!payload || payload === lastScanRef.current) return;
    lastScanRef.current = payload;
    scannerRef.current?.stop();
    setPreviewActive(false);
    onScanRef.current(payload);
    window.setTimeout(() => {
      if (lastScanRef.current === payload) lastScanRef.current = "";
    }, 2500);
  };

  const startCamera = async () => {
    setError("");

    if (!window.isSecureContext) {
      setError(
        "Camera needs HTTPS or localhost. This page is on plain HTTP, so browsers block the camera. Use “Upload QR image” below.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is not supported in this browser. Use “Upload QR image” instead.");
      return;
    }
    if (state === "denied") {
      setError(
        "Camera permission is blocked. Allow camera for this site, then try again — or upload a QR image.",
      );
      return;
    }

    setStarting(true);
    // Show the video element BEFORE requesting the stream so React does not keep it display:none.
    setPreviewActive(true);

    try {
      // Wait a frame so the video node is laid out/visible.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const video = videoRef.current;
      if (!video) {
        throw new Error("Camera preview is not ready yet. Please try again.");
      }

      configureQrScannerForReliability();

      if (!scannerRef.current) {
        scannerRef.current = new QrScanner(
          video,
          (result) => {
            const data = typeof result === "string" ? result : result.data;
            if (data) emitScan(data);
          },
          {
            returnDetailedScanResult: true,
            highlightScanRegion: true,
            highlightCodeOutline: true,
            preferredCamera: "environment",
            maxScansPerSecond: 8,
            // Use a larger center region; default can miss dense CCash JSON QRs.
            calculateScanRegion: (v) => {
              const smallest = Math.min(v.videoWidth, v.videoHeight);
              const scanSize = Math.round(smallest * 0.85);
              return {
                x: Math.round((v.videoWidth - scanSize) / 2),
                y: Math.round((v.videoHeight - scanSize) / 2),
                width: scanSize,
                height: scanSize,
                downScaledWidth: 500,
                downScaledHeight: 500,
              };
            },
          },
        );
        scannerRef.current.setInversionMode("both");
      }

      await scannerRef.current.start();
    } catch (err: unknown) {
      const message = String((err as { message?: string })?.message || err || "");
      scannerRef.current?.stop();
      setPreviewActive(false);
      if (/NotAllowedError|Permission denied|PermissionDismissed/i.test(message)) {
        setError("Camera permission was denied. Enable camera access, or upload a QR image instead.");
      } else if (/NotFoundError|DevicesNotFound/i.test(message)) {
        setError("No camera was found on this device. Upload a QR image instead.");
      } else if (/NotReadableError|TrackStartError/i.test(message)) {
        setError("Camera is already in use by another app. Close it and try again.");
      } else if (!window.isSecureContext) {
        setError("Camera access requires HTTPS (or localhost). Use “Upload QR image” on this HTTP page.");
      } else {
        setError(message || "Unable to start the camera. Try uploading a QR image.");
      }
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    if (cameraBlocked || hasCamera === false || previewActive || starting) return;
    if (state === "unknown") return;
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startCamera();
  }, [active, cameraBlocked, hasCamera, state, previewActive, starting]);

  const stopCamera = () => {
    scannerRef.current?.stop();
    setPreviewActive(false);
  };

  const handleUploadClick = () => {
    setError("");
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setDecoding(true);
    setError("");
    try {
      const payload = await decodeQrFromFile(file);
      stopCamera();
      emitScan(payload);
    } catch (err: unknown) {
      const message = String((err as { message?: string })?.message || err || "");
      setError(message || "Could not read that image. Try another photo of the QR code.");
    } finally {
      setDecoding(false);
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      {state === "insecure" && (
        <Alert severity="warning" sx={{ borderRadius: 2, mb: 2 }}>
          This page is not a secure context (plain HTTP on a LAN host). Browsers block the camera
          here. Use <strong>Upload QR image</strong>, or open via <code>https://</code> /{" "}
          <code>localhost</code> for live scanning.
        </Alert>
      )}

      {state === "denied" && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>
          Camera permission is blocked. On iPhone: Settings → Safari → Camera. On Android Chrome:
          Site settings → Camera → Allow. Or upload a QR image below.
        </Alert>
      )}

      {state === "unsupported" && (
        <Alert severity="info" sx={{ borderRadius: 2, mb: 2 }}>
          Live camera is not available in this browser. Upload a QR image instead.
        </Alert>
      )}

      {hasCamera === false && state !== "insecure" && (
        <Alert severity="info" sx={{ borderRadius: 2, mb: 2 }}>
          No camera detected. You can upload a QR image or paste the payload below.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp,.gif"
        hidden
        onChange={handleFileChange}
      />

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
            // Keep the element in layout while previewing; never flip via display:none mid-start.
            visibility: previewActive ? "visible" : "hidden",
            position: previewActive ? "relative" : "absolute",
            inset: previewActive ? "auto" : 0,
            backgroundColor: "#0b1220",
          }}
        />

        {!previewActive && (
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
              {cameraBlocked
                ? "Live camera is unavailable on this connection. Upload a photo of the QR code instead."
                : "Camera starts automatically — point at a CCash receive QR, or upload a photo."}
            </Typography>

            <Stack spacing={1.25} sx={{ width: "100%", maxWidth: 280, mt: 1 }}>
              {cameraBlocked ? (
                <Button
                  variant="contained"
                  startIcon={decoding ? <CircularProgress size={16} color="inherit" /> : <UploadFileIcon />}
                  onClick={handleUploadClick}
                  disabled={decoding}
                  sx={{ minHeight: 48 }}
                >
                  {decoding ? "Reading QR..." : "Upload QR image"}
                </Button>
              ) : (
                <>
                  <Button
                    variant="contained"
                    startIcon={starting ? <CircularProgress size={16} color="inherit" /> : <CameraswitchIcon />}
                    onClick={startCamera}
                    disabled={starting || decoding}
                    sx={{ minHeight: 48 }}
                  >
                    {starting ? "Starting camera..." : previewActive ? "Scanning..." : "Allow camera & scan"}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={decoding ? <CircularProgress size={16} color="inherit" /> : <PhotoCameraIcon />}
                    onClick={handleUploadClick}
                    disabled={decoding || starting}
                    sx={{
                      minHeight: 44,
                      color: "white",
                      borderColor: "rgba(255,255,255,0.45)",
                      "&:hover": { borderColor: "white", bgcolor: "rgba(255,255,255,0.08)" },
                    }}
                  >
                    {decoding ? "Reading QR..." : "Upload QR image"}
                  </Button>
                </>
              )}
            </Stack>
          </Box>
        )}

        {previewActive && (
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
              Align the QR inside the frame
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleUploadClick}
                disabled={decoding}
                sx={{ color: "white", borderColor: "rgba(255,255,255,0.5)" }}
              >
                Upload
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={stopCamera}
                sx={{ color: "white", borderColor: "rgba(255,255,255,0.5)" }}
              >
                Stop
              </Button>
            </Stack>
          </Box>
        )}
      </Box>
    </Box>
  );
}
