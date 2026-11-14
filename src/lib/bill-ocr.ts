import { validateBillImage } from "@/lib/bill-scan";

export type OcrProgress = { percent: number; label: string };

export async function scanBillImage(file: File, onProgress: (progress: OcrProgress) => void, signal: AbortSignal) {
  validateBillImage(file);
  if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
  onProgress({ percent: 2, label: "Preparing and enhancing photo…" });
  const image = await createImageBitmap(file);
  let blob: Blob | null = null;
  try {
    if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
    // Upscale small receipts for OCR, while limiting very large camera photos for mobile memory.
    const sourceMax = Math.max(image.width, image.height);
    const scale = Math.min(2, 3000 / sourceMax);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Photo processing is unavailable on this device.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Convert to grayscale and improve contrast to help read faint thermal-paper print.
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = frame.data;
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = Math.round(0.299 * (pixels[i] ?? 0) + 0.587 * (pixels[i + 1] ?? 0) + 0.114 * (pixels[i + 2] ?? 0));
      total += gray;
      pixels[i] = gray; pixels[i + 1] = gray; pixels[i + 2] = gray;
    }
    const average = total / Math.max(1, pixels.length / 4);
    const contrast = average < 115 ? 1.28 : average > 210 ? 1.55 : 1.38;
    const brightness = average < 115 ? 8 : average > 210 ? -12 : 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = pixels[i] ?? 0;
      const enhanced = Math.max(0, Math.min(255, (gray - 128) * contrast + 128 + brightness));
      pixels[i] = enhanced; pixels[i + 1] = enhanced; pixels[i + 2] = enhanced;
    }
    context.putImageData(frame, 0, 0);
    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  } finally { image.close(); }
  if (!blob) throw new Error("Could not read this photo. Choose another image.");
  if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");

  const { default: Tesseract } = await import("tesseract.js/dist/tesseract.esm.min.js");
  if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
  const base = new URL("/ocr", window.location.origin).href;
  onProgress({ percent: 10, label: "Loading on-device scanner…" });
  try {
    const response = await fetch(`${base}/eng.traineddata.gz`, { signal });
    if (!response.ok) throw new Error("Scanner language download failed");
    const language = new Uint8Array(await response.arrayBuffer());
    if (!language.length) throw new Error("Scanner language file is empty");
  } catch (error) {
    if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
    throw new Error("Could not load the on-device scanner. Check your connection and retry. Your photo has not been uploaded.", { cause: error });
  }

  let stopWorker: (() => void) | undefined;
  let rejectAbort: ((reason: unknown) => void) | undefined;
  let rejectWorkerError: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const workerFailed = new Promise<never>((_, reject) => { rejectWorkerError = reject; });
  const abort = () => { stopWorker?.(); rejectAbort?.(new DOMException("Scan cancelled", "AbortError")); };
  signal.addEventListener("abort", abort, { once: true });
  const task = (async () => {
    const worker = await Tesseract.createWorker("eng", 1, {
      workerPath: `${base}/worker.min.js`, corePath: base, langPath: base,
      workerBlobURL: false, cacheMethod: "none", gzip: true,
      logger: message => {
        if (signal.aborted) return;
        const reading = message.status === "recognizing text";
        const percent = reading ? 35 + Math.round(message.progress * 64) : message.status === "loading language traineddata" ? 15 + Math.round(message.progress * 15) : 8;
        onProgress({ percent, label: reading ? "Reading enhanced bill photo…" : "Loading on-device scanner…" });
      },
      errorHandler: () => { rejectWorkerError?.(new Error("The on-device scanner stopped. Retry or choose another photo.")); },
    });
    stopWorker = () => { void worker.terminate(); };
    try {
      if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
      const { data } = await worker.recognize(blob, { rotateAuto: true }, { text: true });
      onProgress({ percent: 100, label: "Scan complete" });
      return { text: data.text, confidence: data.confidence };
    } finally { await worker.terminate(); }
  })();
  try { return await Promise.race([task, aborted, workerFailed]); }
  finally { signal.removeEventListener("abort", abort); stopWorker?.(); }
}
