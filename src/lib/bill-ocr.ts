import { validateBillImage } from "@/lib/bill-scan";

export type OcrProgress = { percent: number; label: string };

export async function scanBillImage(file: File, onProgress: (progress: OcrProgress) => void, signal: AbortSignal) {
  validateBillImage(file);
  if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
  onProgress({ percent: 2, label: "Preparing photo…" });
  const image = await createImageBitmap(file);
  let blob: Blob | null = null;
  try {
    if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
    const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable on this device.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  } finally { image.close(); }
  if (!blob) throw new Error("Could not read this photo. Choose another image.");
  if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
  // Browser distribution only: no Node modules in the SSR graph, no remote CDN defaults.
  const { default: Tesseract } = await import("tesseract.js/dist/tesseract.esm.min.js");
  if (signal.aborted) throw new DOMException("Scan cancelled", "AbortError");
  const base = new URL("/ocr", window.location.origin).href;
  // Preflight the same-origin language asset so network failures have a useful
  // error before Tesseract's internal initialization; the worker reads it itself.
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
        onProgress({ percent, label: reading ? "Reading bill…" : "Loading on-device scanner…" });
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