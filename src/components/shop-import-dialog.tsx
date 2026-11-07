import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { importCounts, importHeaders, parseShopRows, type ImportResult, type ShopImportRow } from "@/lib/shop-import";
import { previewShopImport, saveShopImport } from "@/lib/shop-import.functions";

export function ShopImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [rows, setRows] = useState<ShopImportRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const preview = useServerFn(previewShopImport);
  const save = useServerFn(saveShopImport);
  const qc = useQueryClient();
  const counts = importCounts(results);

  async function chooseFile(file?: File) {
    if (!file) return;
    setRows([]); setResults([]); setFinished(false); setError(""); setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".xlsx")) { setError("Select an .xlsx workbook"); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Workbook must be smaller than 10 MB"); return; }
    setBusy(true);
    try {
      const { readSheet } = await import("read-excel-file/browser");
      const cells = await readSheet(file, { parseNumber: (value) => value });
      const parsed = parseShopRows(cells);
      const checked = await preview({ data: { rows: parsed } });
      setRows(parsed); setResults(checked);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read workbook"); }
    finally { setBusy(false); }
  }

  async function importRows() {
    setBusy(true); setError("");
    try {
      const saved = await save({ data: { rows } });
      setResults(saved); setFinished(true);
      await qc.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not import shops");
      // Re-check persisted mobile numbers before offering any retry.
      try { setResults(await preview({ data: { rows } })); } catch { setRows([]); }
    } finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value); }}>
    <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl flex-col overflow-hidden p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle>Import shops from Excel</DialogTitle>
        <DialogDescription>{finished ? "Import complete" : "Review shops before importing"}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="shop-workbook">Excel workbook</Label>
        <Input id="shop-workbook" type="file" accept=".xlsx" disabled={busy} onChange={(e) => { void chooseFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />{rows.length ? "Importing shops…" : "Reading and checking shops…"}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!!results.length && <>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" role="status">
          <span className="font-semibold">{rows.length} records</span>
          {finished ? <span className="text-success">Successful: {counts.successful}</span> : <span className="text-success">Ready: {counts.ready}</span>}
          <span>Duplicate: {counts.duplicate}</span>
          <span className={counts.failed ? "text-destructive" : "text-muted-foreground"}>Failed: {counts.failed}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          <table className="w-full min-w-[1050px] text-left text-sm" aria-label="Shop import preview">
            <thead className="sticky top-0 bg-muted"><tr><th className="p-3">Row</th>{importHeaders.map((h) => <th key={h} className="p-3">{h}</th>)}<th className="p-3">Status</th></tr></thead>
            <tbody className="divide-y">{rows.map((row, i) => <tr key={row.row_number}>
              <td className="p-3 text-muted-foreground">{row.row_number}</td>
              {[row.shop_name, row.contact_person, row.mobile_number, row.area, row.address, row.incharge].map((value, j) => <td key={j} className="max-w-64 break-words p-3 align-top">{value || "—"}</td>)}
              <td className={`p-3 ${results[i]?.status === "failed" ? "text-destructive" : results[i]?.status === "successful" ? "text-success" : "text-muted-foreground"}`}>{results[i]?.message}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="min-w-0 break-all text-xs text-muted-foreground">{fileName}</span>
          <Button disabled={busy || (!finished && !counts.ready)} onClick={() => finished ? onOpenChange(false) : void importRows()}>
            {!finished && <Upload className="h-4 w-4" />}{finished ? "Done" : `Import ${counts.ready} shops`}
          </Button>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}