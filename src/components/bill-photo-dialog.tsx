import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Camera, Check, ImagePlus, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";
import { extractBillFields, suggestShops, validateBillImage, validateScannedBill, type ScannedBillDraft } from "@/lib/bill-scan";
import { scanBillImage, type OcrProgress } from "@/lib/bill-ocr";
import { scanBillWithGemini } from "@/lib/gemini-bill-scan.functions";
import { findScannedBillDuplicates, saveConfirmedScannedBill } from "@/lib/bill-scan-save";
import { inr, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentToolPicker } from "@/components/payment-tool-picker";

async function prepareGeminiImage(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable on this device.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not prepare the bill photo.")), "image/jpeg", 0.82);
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return { mimeType: "image/jpeg" as const, imageBase64: btoa(binary) };
  } finally { bitmap.close(); }
}

export function BillPhotoDialog({ onClose, shopId }: { onClose: () => void; shopId?: string }) {
  const { data: me } = useMe();
  const owner = me?.role === "owner";
  const qc = useQueryClient();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const scanController = useRef<AbortController | null>(null);
  const saveLock = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<OcrProgress>({ percent: 0, label: "" });
  const [scanError, setScanError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [scanWarning, setScanWarning] = useState("");
  const [shopName, setShopName] = useState("");
  const [draft, setDraft] = useState<ScannedBillDraft>({ shopId: shopId ?? "", billDate: "", amount: "", billNumber: "" });

  useEffect(() => () => { scanController.current?.abort(); }, []);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const shops = useQuery({
    queryKey: ["bill-scan-shops"], enabled: owner,
    queryFn: async () => {
      // Page through existing shops; no silent 1,000-row truncation of matching.
      const all: { id: string; name: string; area: string | null; contact_name: string | null }[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("shops").select("id, name, area, contact_name").order("name").order("id").range(offset, offset + 999);
        if (error) throw new Error("Could not load shops. Try again.");
        all.push(...(data ?? []));
        if (!data || data.length < 1000) return all;
      }
    },
  });

  let valid = false;
  try { validateScannedBill(draft); valid = true; } catch { /* incomplete form */ }
  const duplicates = useQuery({
    queryKey: ["bill-scan-duplicates", draft.shopId, draft.billDate, draft.amount, draft.billNumber.trim()],
    enabled: owner && Boolean(file) && !scanning && valid,
    queryFn: () => findScannedBillDuplicates(draft), retry: false, staleTime: 0,
  });
  const suggestions = suggestShops(shopName, shops.data ?? []);

  const save = useMutation({
    mutationFn: (confirmed: ScannedBillDraft) => saveConfirmedScannedBill(confirmed), retry: false,
    onSuccess: bill => {
      toast.success(`Bill ${bill.bill_number} saved`);
      void qc.invalidateQueries();
      onClose();
    },
    onError: error => { setSaveError(error instanceof Error ? error.message : "Could not save bill. Try again."); void duplicates.refetch(); },
    onSettled: () => { saveLock.current = false; },
  });

  const update = (key: keyof ScannedBillDraft, value: string) => {
    setSaveError("");
    setDraft(current => ({ ...current, [key]: value }));
  };

  async function scan(nextFile: File) {
    scanController.current?.abort();
    const controller = new AbortController();
    scanController.current = controller;
    setScanning(true); setScanError(""); setSaveError(""); setScanWarning("");
    setProgress({ percent: 0, label: "Preparing photo…" });
    try {
      setProgress({ percent: 8, label: "Preparing bill photo for AI…" });
      let aiError = "";
      try {
        const prepared = await prepareGeminiImage(nextFile);
        if (controller.signal.aborted) return;
        setProgress({ percent: 35, label: "Gemini AI is reading shop, date and total…" });
        const extracted = await scanBillWithGemini({
          data: {
            ...prepared,
            shopNames: (shops.data ?? []).slice(0, 1500).map(shop => shop.name),
          },
        });
        if (controller.signal.aborted) return;
        setProgress({ percent: 100, label: "AI scan complete" });
        setShopName(extracted.shopName);
        setDraft({ shopId: shopId ?? "", billDate: extracted.billDate, amount: extracted.amount, billNumber: "" });
        if (!extracted.shopName || !extracted.billDate || !extracted.amount) {
          setScanWarning("AI could not confidently read every field. Check and correct the details before saving.");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        aiError = error instanceof Error ? error.message : "AI scan was unavailable.";
        setProgress({ percent: 45, label: "AI unavailable. Trying on-device scanner…" });
        const result = await scanBillImage(nextFile, next => {
          if (!controller.signal.aborted) setProgress(current => ({ ...next, percent: Math.max(current.percent, 45 + Math.round(next.percent * 0.55)) }));
        }, controller.signal);
        if (controller.signal.aborted) return;
        const extracted = extractBillFields(result.text);
        setShopName(extracted.shopName);
        setDraft({ shopId: shopId ?? "", billDate: extracted.billDate, amount: extracted.amount, billNumber: "" });
        setScanWarning(`AI scan unavailable (${aiError}). On-device scan was used; carefully verify every field.`);
        if (!result.text.trim() || result.confidence < 65 || !extracted.shopName || !extracted.billDate || !extracted.amount) {
          setScanWarning(`AI scan unavailable (${aiError}). The backup scanner may have missed details. Correct them manually before saving.`);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setScanError(error instanceof Error && /photo|image|device/i.test(error.message) ? error.message : "Could not read this photo. Retry, choose another image, or enter the details below.");
    } finally { if (!controller.signal.aborted) setScanning(false); }
  }

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile || save.isPending) return;
    try { validateBillImage(nextFile); }
    catch (error) { setScanError(error instanceof Error ? error.message : "Choose another image."); return; }
    setFile(nextFile); setImageUrl(URL.createObjectURL(nextFile));
    setShopName(""); setDraft({ shopId: shopId ?? "", billDate: "", amount: "", billNumber: "" });
    void scan(nextFile);
  }

  if (!owner) return null;
  return (
    <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto p-4 sm:p-6" aria-busy={scanning || save.isPending}>
        <DialogHeader className="pr-7">
          <DialogTitle>Photo bill</DialogTitle>
          <DialogDescription className="flex items-center justify-center gap-1.5 text-xs sm:justify-start"><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-accent-foreground" /> Photo is sent securely to Gemini AI for reading. Only confirmed bill details are saved in Gopal.</DialogDescription>
        </DialogHeader>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label="Take bill photo" className="hidden" onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
        <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp,image/bmp" aria-label="Upload bill photo" className="hidden" onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={file ? "outline" : "default"} disabled={save.isPending} onClick={() => cameraInput.current?.click()}><Camera className="h-4 w-4" /> Take photo</Button>
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => galleryInput.current?.click()}><ImagePlus className="h-4 w-4" /> {file ? "Choose another image" : "Upload photo"}</Button>
          {file && !scanning && <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => void scan(file)}><RotateCcw className="h-4 w-4" /> Retry scan</Button>}
        </div>
        {scanError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Photo could not be scanned</AlertTitle><AlertDescription>{scanError}</AlertDescription></Alert>}
        {file && <div className="grid min-w-0 gap-5 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
          <figure className="min-w-0 space-y-2">
            <img src={imageUrl} alt="Scanned bill for verification" className="max-h-96 w-full rounded-lg border bg-muted object-contain" />
            <figcaption className="break-all text-xs text-muted-foreground">{file.name}</figcaption>
          </figure>
          {scanning ? <div className="flex min-h-40 flex-col justify-center gap-3" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> {progress.label}</div>
            <Progress value={progress.percent} aria-label="Scanning progress" /><span className="text-xs text-muted-foreground">{progress.percent}%</span>
            <Button type="button" variant="outline" onClick={() => { scanController.current?.abort(); setScanning(false); setScanWarning("Scan cancelled. You can retry or enter the details below."); }}>Cancel scan</Button>
          </div> : <form className="min-w-0 space-y-4" onSubmit={event => {
            event.preventDefault();
            if (saveLock.current || !file) return;
            try { validateScannedBill(draft); } catch (error) { setSaveError(error instanceof Error ? error.message : "Check bill details."); return; }
            saveLock.current = true; setSaveError(""); save.mutate({ ...draft });
          }}>
            {scanWarning && <p role="status" className="rounded-md border border-warning/50 bg-warning/10 p-3 text-xs text-warning-foreground">{scanWarning}</p>}
            <fieldset disabled={save.isPending} className="min-w-0 space-y-4">
              <legend className="mb-3 text-sm font-semibold">Review bill details</legend>
              <div className="space-y-1.5">
                <Label htmlFor="scan-shop-name">Shop name from photo</Label>
                <Input id="scan-shop-name" value={shopName} onChange={event => setShopName(event.target.value)} placeholder="Shop name" />
                {suggestions.length > 0 && <div className="space-y-1"><p className="text-xs text-muted-foreground">Matching shops</p>{suggestions.map(shop => <Button key={shop.id} type="button" variant={draft.shopId === shop.id ? "secondary" : "ghost"} className="h-auto min-h-9 w-full justify-between whitespace-normal text-left" onClick={() => update("shopId", shop.id)}><span className="min-w-0 break-words">{shop.name}</span>{draft.shopId === shop.id && <Check className="h-4 w-4 shrink-0" />}</Button>)}</div>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scan-shop">Shop *</Label>
                <PaymentToolPicker id="scan-shop" label="Shop" placeholder={shops.isPending ? "Loading shops…" : "Select existing shop"} searchPlaceholder="Search existing shops" value={draft.shopId} onChange={value => update("shopId", value)} disabled={shops.isPending || shops.isError || save.isPending} options={(shops.data ?? []).map(shop => ({ value: shop.id, label: shop.name, detail: [shop.area, shop.contact_name].filter(Boolean).join(" · ") }))} emptyText="No existing shops found." />
                {shops.isError && <div role="alert" className="text-xs text-destructive">Could not load shops. <Button type="button" variant="link" size="sm" onClick={() => void shops.refetch()}>Retry</Button></div>}
              </div>
              <div className="space-y-1.5"><Label htmlFor="scan-date">Bill date *</Label><Input id="scan-date" type="date" required value={draft.billDate} onChange={event => update("billDate", event.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="scan-amount">Total amount (₹) *</Label><Input id="scan-amount" type="number" inputMode="decimal" step="0.01" min="0.01" required value={draft.amount} onChange={event => update("amount", event.target.value)} /></div>
            </fieldset>
            {valid && duplicates.isFetching && <p role="status" className="text-xs text-muted-foreground">Checking existing bills…</p>}
            {valid && duplicates.isError && <Alert variant="destructive"><AlertTitle>Duplicate check failed</AlertTitle><AlertDescription>Existing bills could not be checked. <Button type="button" variant="link" size="sm" onClick={() => void duplicates.refetch()}>Retry check</Button></AlertDescription></Alert>}
            {valid && Boolean(duplicates.data?.length) && <Alert className="border-warning/50 bg-warning/10 text-warning-foreground"><AlertTriangle className="h-4 w-4" /><AlertTitle>Possible duplicate — not saved</AlertTitle><AlertDescription><ul className="mt-1 space-y-1">{duplicates.data?.map(bill => <li key={bill.id} className="break-words">{bill.bill_number} · {fmtDate(bill.bill_date)} · {inr(bill.amount)}</li>)}</ul><Link to="/shops/$id" params={{ id: draft.shopId }} className="mt-2 inline-block font-semibold underline">View existing bills</Link></AlertDescription></Alert>}
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
            <Button type="submit" className="min-h-11 w-full" disabled={!valid || save.isPending || duplicates.isFetching || duplicates.isError || Boolean(duplicates.data?.length) || shops.isError || shops.isPending}>{save.isPending ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Saving…</> : <><Check className="h-4 w-4" /> Confirm &amp; Save</>}</Button>
          </form>}
        </div>}
      </DialogContent>
    </Dialog>
  );
}