import { describe, expect, it } from "vitest";
import { extractBillFields, suggestShops, validateBillImage, validateScannedBill } from "@/lib/bill-scan";

describe("Bill photo extraction", () => {
  it("reads only customer shop, date, bill number and final total, not supplier or product totals", () => {
    expect(extractBillFields(`SAI SINDHU ENTERPRISES\nShop Name: Mahalaxmi Stores\nBill No: SS-108/26\nBill Date: 14/11/2026\nNamkeen 10 150.00\nSubtotal: 1,500.00\nTotal Qty: 10\nTax Total: 75.00\nGrand Total: Rs. 1,575.00`)).toEqual({
      shopName: "Mahalaxmi Stores", billDate: "2026-11-14", amount: "1575.00", billNumber: "SS-108/26",
    });
  });
  it("keeps bill number blank when absent", () => {
    expect(extractBillFields("Bill To:\nRavi Stores\nDate: 14 Nov 2026\nNet Amount: INR 600.50")).toEqual({ shopName: "Ravi Stores", billDate: "2026-11-14", amount: "600.50", billNumber: "" });
  });
  it("does not infer a customer from an unlabelled supplier heading", () => {
    expect(extractBillFields("Sai Sindhu Enterprises\nDate 2026-11-14\nTotal 500").shopName).toBe("");
  });
  it("leaves impossible dates and missing amounts for correction", () => {
    expect(extractBillFields("Shop: Ravi Stores\nDate: 31/02/2026\nProduct 10 25")).toEqual({ shopName: "Ravi Stores", billDate: "", amount: "", billNumber: "" });
  });
});

describe("Existing shop matching", () => {
  it("suggests existing shops by normalized name, preserving separate same-name shops", () => {
    const shops = [{ id: "1", name: "Ravi Stores" }, { id: "2", name: "RAVI STORES" }, { id: "3", name: "Unrelated Shop" }];
    expect(suggestShops("Ravi-Stores", shops).map(shop => shop.id).sort()).toEqual(["1", "2"]);
    expect(suggestShops("Unknown Name", shops)).toEqual([]);
  });
});

describe("Confirmed bill input rules", () => {
  const draft = { shopId: "existing-shop", billDate: "2026-11-14", amount: "600.50", billNumber: "" };
  it("requires a selected existing shop", () => { expect(() => validateScannedBill({ ...draft, shopId: "" })).toThrow("Select an existing shop"); });
  it("requires a valid bill date", () => { expect(() => validateScannedBill({ ...draft, billDate: "2026-02-31" })).toThrow("valid bill date"); });
  it("requires an amount greater than zero", () => {
    for (const amount of ["0", "-1", "", "Infinity", "1.001"]) expect(() => validateScannedBill({ ...draft, amount })).toThrow();
    expect(validateScannedBill(draft).amount).toBe(600.5);
  });
  it("omits an absent number so existing automatic bill numbering remains authoritative", () => {
    expect(validateScannedBill(draft)).toEqual({ shop_id: "existing-shop", bill_date: "2026-11-14", amount: 600.5 });
  });
  it("includes a supplied number without generated balances, status, payment data or image data", () => {
    expect(validateScannedBill({ ...draft, billNumber: " SS-12 " })).toEqual({ shop_id: "existing-shop", bill_date: "2026-11-14", amount: 600.5, bill_number: "SS-12" });
  });
  it("accepts camera JPEGs but rejects empty images and unsupported formats", () => {
    expect(() => validateBillImage({ type: "image/jpeg", size: 1000 })).not.toThrow();
    expect(() => validateBillImage({ type: "image/jpeg", size: 0 })).toThrow("empty");
    expect(() => validateBillImage({ type: "application/pdf", size: 1000 })).toThrow("photo");
  });
});