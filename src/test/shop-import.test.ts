import { describe, expect, it } from "vitest";
import { assertImportOwner, importCounts, importHeaders, parseShopRows, previewShopRows, type ShopImportRow } from "@/lib/shop-import";

const row = (mobile: string, name = "Shop"): ShopImportRow => ({ row_number: 2, shop_name: name, contact_person: "Person", mobile_number: mobile, area: "Area", address: "Full address", incharge: "Incharge" });
describe("Shop import rules", () => {
  it("maps the six workbook columns", () => {
    expect(parseShopRows([[...importHeaders], ["Shop", "Person", "0123456789", "Area", "Full address", "Incharge"]])[0]).toEqual(row("0123456789"));
  });
  it("preserves mobile numbers as text including leading zeroes", () => {
    expect(parseShopRows([[...importHeaders], ["Shop", "", "001234567890", "", "", ""]])[0]?.mobile_number).toBe("001234567890");
  });
  it("previews all 246 records", () => {
    const rows = parseShopRows([[...importHeaders], ...Array.from({ length: 246 }, (_, i) => [`Shop ${i}`, "", String(9000000000 + i), "", "", ""])]);
    expect(previewShopRows(rows, [])).toHaveLength(246);
  });
  it("detects duplicate mobiles within a workbook", () => {
    expect(previewShopRows([row("9876543210"), { ...row("98765 43210"), row_number: 3 }], []).map((r) => r.status)).toEqual(["ready", "duplicate"]);
  });
  it("skips existing mobiles without changing existing records", () => {
    const existing = ["9876543210"];
    expect(previewShopRows([row("9876543210", "New name")], existing)[0]?.status).toBe("duplicate");
    expect(existing).toEqual(["9876543210"]);
  });
  it("does not merge duplicate shop names", () => {
    expect(previewShopRows([row("9876543210"), row("9876543211")], []).map((r) => r.status)).toEqual(["ready", "ready"]);
  });
  it("does not treat blank mobile numbers as duplicates", () => {
    expect(previewShopRows([row(""), row("")], [""]).map((r) => r.status)).toEqual(["ready", "ready"]);
  });
  it("counts successful, duplicate and failed records separately", () => {
    expect(importCounts([{ row_number: 2, status: "successful", message: "" }, { row_number: 3, status: "duplicate", message: "" }, { row_number: 4, status: "failed", message: "" }])).toEqual({ successful: 1, duplicate: 1, failed: 1, ready: 0 });
  });
  it("rejects non-owners", () => {
    expect(() => assertImportOwner(false)).toThrow("Only the owner can import shops");
    expect(() => assertImportOwner(true)).not.toThrow();
  });
});