/** Build a CCash receipt PNG and share/download it as payment proof. */

export interface ReceiptShareData {
  title: string;
  subtitle?: string;
  amountLabel: string;
  rows: { label: string; value: string }[];
  reference?: string | null;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

export async function buildReceiptPng(data: ReceiptShareData): Promise<Blob> {
  const scale = 2;
  const width = 420;
  const padX = 28;
  const contentW = width - padX * 2;

  // Measure height first with an offscreen canvas
  const measure = document.createElement("canvas");
  const mctx = measure.getContext("2d");
  if (!mctx) throw new Error("Canvas is not available.");

  let y = 36;
  y += 28; // brand
  y += 8;
  y += 26; // title
  if (data.subtitle) y += 20;
  y += 18;
  y += 40; // amount
  y += 28; // divider
  for (const row of data.rows) {
    mctx.font = "600 13px system-ui, sans-serif";
    const valueLines = wrapText(mctx, row.value, contentW * 0.58);
    y += Math.max(22, valueLines.length * 18) + 10;
  }
  if (data.reference) {
    mctx.font = "600 12px ui-monospace, monospace";
    const refLines = wrapText(mctx, data.reference, contentW * 0.62);
    y += Math.max(22, refLines.length * 16) + 10;
  }
  y += 36; // footer
  y += 28;
  const height = Math.ceil(y);

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = "#f7faf9";
  ctx.fillRect(0, 0, width, height);

  // Card
  const cardX = 16;
  const cardY = 16;
  const cardW = width - 32;
  const cardH = height - 32;
  roundRect(ctx, cardX, cardY, cardW, cardH, 18);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#e5ebe8";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Green header band
  roundRect(ctx, cardX, cardY, cardW, 88, 18);
  ctx.fillStyle = "#00b894";
  ctx.fill();
  ctx.fillRect(cardX, cardY + 70, cardW, 18);

  let cy = cardY + 28;
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 15px \"League Spartan\", system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CCash", width / 2, cy);

  cy = cardY + 108;
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 20px \"League Spartan\", system-ui, sans-serif";
  ctx.fillText(data.title, width / 2, cy);

  if (data.subtitle) {
    cy += 22;
    ctx.fillStyle = "#64748b";
    ctx.font = "400 12px system-ui, sans-serif";
    ctx.fillText(data.subtitle, width / 2, cy);
  }

  cy += 36;
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 28px \"League Spartan\", system-ui, sans-serif";
  ctx.fillText(data.amountLabel, width / 2, cy);

  cy += 24;
  ctx.strokeStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.moveTo(padX, cy);
  ctx.lineTo(width - padX, cy);
  ctx.stroke();

  cy += 22;
  ctx.textAlign = "left";
  for (const row of data.rows) {
    ctx.fillStyle = "#64748b";
    ctx.font = "400 12px system-ui, sans-serif";
    ctx.fillText(row.label, padX, cy);

    ctx.fillStyle = "#0f172a";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textAlign = "right";
    const valueLines = wrapText(ctx, row.value, contentW * 0.58);
    valueLines.forEach((line, i) => {
      ctx.fillText(line, width - padX, cy + i * 18);
    });
    ctx.textAlign = "left";
    cy += Math.max(22, valueLines.length * 18) + 10;
  }

  if (data.reference) {
    ctx.fillStyle = "#64748b";
    ctx.font = "400 12px system-ui, sans-serif";
    ctx.fillText("Reference", padX, cy);

    ctx.fillStyle = "#0f172a";
    ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "right";
    const refLines = wrapText(ctx, data.reference, contentW * 0.62);
    refLines.forEach((line, i) => {
      ctx.fillText(line, width - padX, cy + i * 16);
    });
    ctx.textAlign = "left";
    cy += Math.max(22, refLines.length * 16) + 10;
  }

  cy += 12;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "400 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CCash · Proof of payment", width / 2, cy);
  ctx.fillText(new Date().toLocaleString("en-PH"), width / 2, cy + 16);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create receipt image."));
    }, "image/png");
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function receiptShareText(data: ReceiptShareData): string {
  const lines = [
    `CCash — ${data.title}`,
    data.amountLabel,
    ...data.rows.map((r) => `${r.label}: ${r.value}`),
  ];
  if (data.reference) lines.push(`Reference: ${data.reference}`);
  if (data.subtitle) lines.splice(1, 0, data.subtitle);
  return lines.join("\n");
}

export function receiptFilename(reference?: string | null): string {
  const slug = (reference || "receipt").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "receipt";
  return `ccash-${slug}.png`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareReceipt(data: ReceiptShareData): Promise<"shared" | "downloaded" | "text"> {
  const blob = await buildReceiptPng(data);
  const filename = receiptFilename(data.reference);
  const text = receiptShareText(data);
  const file = new File([blob], filename, { type: "image/png" });

  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `CCash — ${data.title}`,
        text,
      });
      return "shared";
    }
  } catch (err) {
    // User cancelled share sheet — treat as done, not an error.
    if ((err as { name?: string })?.name === "AbortError") return "shared";
  }

  try {
    if (navigator.share) {
      await navigator.share({
        title: `CCash — ${data.title}`,
        text,
      });
      // Still offer the image locally so they have proof.
      downloadBlob(blob, filename);
      return "text";
    }
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return "text";
  }

  downloadBlob(blob, filename);
  return "downloaded";
}

export async function downloadReceipt(data: ReceiptShareData): Promise<void> {
  const blob = await buildReceiptPng(data);
  downloadBlob(blob, receiptFilename(data.reference));
}
