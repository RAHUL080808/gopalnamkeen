import { z } from "zod";

export const importHeaders = ["Shop Name", "Contact Person", "Mobile Number", "Area", "Full Address", "Incharge"] as const;
export const shopImportRowSchema = z.object({
  row_number: z.number().int().positive(),
  shop_name: z.string().trim().min(1, "Shop Name is required").max(120),
  contact_person: z.string().trim().max(120),
  mobile_number: z.string().trim().max(40).refine((v) => !v || (/^\+?[0-9 ()-]+$/.test(v) && normalizeMobile(v).length >= 7 && normalizeMobile(v).length <= 15), "Invalid Mobile Number"),
  area: z.string().trim().max(200),
  address: z.string().trim().max(1000),
  incharge: z.string().trim().max(120),
});
export type ShopImportRow = z.infer<typeof shopImportRowSchema>;
export type ImportResult = { row_number: number; status: "ready" | "successful" | "duplicate" | "failed"; message: string };
export function normalizeMobile(value: string) { return value.replace(/[^0-9]/g, ""); }
export function assertImportOwner(isOwner: boolean) {
  if (!isOwner) throw new Error("Only the owner can import shops");
}

export function parseShopRows(cells: unknown[][]): ShopImportRow[] {
  const header = cells[0]?.map((v) => String(v ?? "").trim()) ?? [];
  const indexes = importHeaders.map((h) => header.indexOf(h));
  if (indexes.some((i) => i < 0)) throw new Error(`Required columns: ${importHeaders.join(", ")}`);
  const rows = cells.slice(1).flatMap((cells, i) => {
    if (cells.every((v) => v == null || String(v).trim() === "")) return [];
    const values = indexes.map((index) => String(cells[index] ?? "").trim());
    return [{ row_number: i + 2, shop_name: values[0] ?? "", contact_person: values[1] ?? "", mobile_number: values[2] ?? "", area: values[3] ?? "", address: values[4] ?? "", incharge: values[5] ?? "" }];
  });
  if (!rows.length) throw new Error("The workbook contains no shop records");
  if (rows.length > 5000) throw new Error("A workbook can contain up to 5,000 records");
  return rows;
}

export function previewShopRows(rows: ShopImportRow[], existingMobiles: string[]): ImportResult[] {
  const existing = new Set(existingMobiles.map(normalizeMobile).filter(Boolean));
  const seen = new Set<string>();
  return rows.map((row) => {
    const parsed = shopImportRowSchema.safeParse(row);
    if (!parsed.success) return { row_number: row.row_number, status: "failed", message: parsed.error.issues[0]?.message ?? "Invalid record" };
    const mobile = normalizeMobile(row.mobile_number);
    if (mobile && (existing.has(mobile) || seen.has(mobile))) return { row_number: row.row_number, status: "duplicate", message: existing.has(mobile) ? "Mobile number already exists" : "Repeated mobile number in workbook" };
    if (mobile) seen.add(mobile);
    return { row_number: row.row_number, status: "ready", message: "Ready" };
  });
}

export function importCounts(results: ImportResult[]) {
  return { successful: results.filter((r) => r.status === "successful").length, duplicate: results.filter((r) => r.status === "duplicate").length, failed: results.filter((r) => r.status === "failed").length, ready: results.filter((r) => r.status === "ready").length };
}