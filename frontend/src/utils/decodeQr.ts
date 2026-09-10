import jsQR from "jsqr";
import QrScanner from "qr-scanner";

// Native BarcodeDetector often returns empty for phone photos of on-screen QRs
// (and is broken on some Chromium/Mac setups) without falling back to the worker.
(QrScanner as unknown as { _disableBarcodeDetector: boolean })._disableBarcodeDetector = true;

function extractPayload(result: unknown): string {
  if (!result) return "";
  if (typeof result === "string") return result.trim();
  if (typeof result === "object" && result !== null && "data" in result) {
    return String((result as { data?: string }).data || "").trim();
  }
  return "";
}

async function loadImageElement(file: File): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return {
    img,
    revoke: () => URL.revokeObjectURL(url),
  };
}

function drawToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide = 1600,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function decodeWithJsQr(ctx: CanvasRenderingContext2D, width: number, height: number): string {
  const imageData = ctx.getImageData(0, 0, width, height);
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  return code?.data?.trim() || "";
}

async function decodeWithQrScanner(source: File | HTMLCanvasElement | HTMLImageElement): Promise<string> {
  const engine = await QrScanner.createQrEngine();
  try {
    const result = await QrScanner.scanImage(source, {
      returnDetailedScanResult: true,
      alsoTryWithoutScanRegion: true,
      qrEngine: engine,
    });
    return extractPayload(result);
  } finally {
    // Close worker if we created one for this attempt.
    try {
      const resolved = await engine;
      if (resolved instanceof Worker) resolved.terminate();
    } catch {
      // ignore
    }
  }
}

/** Decode a QR payload from an uploaded image using multiple engines. */
export async function decodeQrFromFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
    throw new Error("Please choose an image file of the QR code.");
  }

  const errors: string[] = [];

  // 1) qr-scanner worker on the original file
  try {
    const payload = await decodeWithQrScanner(file);
    if (payload) return payload;
  } catch (err) {
    errors.push(String((err as Error)?.message || err));
  }

  // 2) Downscale / canvas pass + jsQR (strong on photos of screens)
  try {
    const { img, revoke } = await loadImageElement(file);
    try {
      const { canvas, ctx } = drawToCanvas(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
      try {
        const viaScanner = await decodeWithQrScanner(canvas);
        if (viaScanner) return viaScanner;
      } catch (err) {
        errors.push(String((err as Error)?.message || err));
      }
      const viaJsQr = decodeWithJsQr(ctx, canvas.width, canvas.height);
      if (viaJsQr) return viaJsQr;

      // 3) Second pass at a smaller size (helps huge phone photos)
      if (Math.max(canvas.width, canvas.height) > 900) {
        const small = drawToCanvas(canvas, canvas.width, canvas.height, 900);
        const viaSmall = decodeWithJsQr(small.ctx, small.canvas.width, small.canvas.height);
        if (viaSmall) return viaSmall;
      }
    } finally {
      revoke();
    }
  } catch (err) {
    errors.push(String((err as Error)?.message || err));
  }

  if (errors.some((e) => /No QR code found/i.test(e))) {
    throw new Error("No QR code found in that image. Try a clearer, well-lit photo of the full QR.");
  }
  throw new Error(errors[0] || "Could not read a QR code from that image.");
}

export function configureQrScannerForReliability(): void {
  (QrScanner as unknown as { _disableBarcodeDetector: boolean })._disableBarcodeDetector = true;
}
