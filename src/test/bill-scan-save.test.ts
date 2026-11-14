import { beforeEach, describe, expect, it, vi } from "vitest";
import { findScannedBillDuplicates, saveConfirmedScannedBill } from "@/lib/bill-scan-save";

const db = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), ilike: vi.fn(), limit: vi.fn(), insert: vi.fn(), single: vi.fn(), getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from, auth: { getUser: db.getUser }, rpc: db.rpc } }));
const draft = { shopId: "shop-1", billDate: "2026-11-14", amount: "600", billNumber: "" };

beforeEach(() => {
  Object.values(db).forEach(mock => mock.mockReset());
  const chain = { select: db.select, eq: db.eq, ilike: db.ilike, limit: db.limit, insert: db.insert, single: db.single };
  db.from.mockReturnValue(chain); db.select.mockReturnValue(chain); db.eq.mockReturnValue(chain); db.ilike.mockReturnValue(chain); db.insert.mockReturnValue(chain);
  db.limit.mockResolvedValue({ data: [], error: null });
  db.getUser.mockResolvedValue({ data: { user: { id: "owner-id" } }, error: null });
  db.rpc.mockResolvedValue({ data: true, error: null });
  db.single.mockResolvedValue({ data: { id: "new-bill", bill_number: "INV-2000", amount: 600, paid_amount: 0, balance: 600, status: "unpaid" }, error: null });
});

describe("Photo bill duplicate rules", () => {
  it("checks same shop plus bill number when supplied, with literal wildcard characters", async () => {
    await findScannedBillDuplicates({ ...draft, billNumber: "BILL_10%" });
    expect(db.eq).toHaveBeenCalledExactlyOnceWith("shop_id", "shop-1");
    expect(db.ilike).toHaveBeenCalledExactlyOnceWith("bill_number", "BILL\\_10\\%");
  });
  it("checks same shop, date and amount when number is absent", async () => {
    await findScannedBillDuplicates(draft);
    expect(db.eq.mock.calls).toEqual([["shop_id", "shop-1"], ["bill_date", "2026-11-14"], ["amount", 600]]);
    expect(db.ilike).not.toHaveBeenCalled();
  });
  it("blocks duplicate insertion even if one appeared after the preview", async () => {
    db.limit.mockResolvedValue({ data: [{ id: "existing" }], error: null });
    await expect(saveConfirmedScannedBill(draft)).rejects.toThrow("Possible duplicate");
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("blocks insertion when duplicate checks fail", async () => {
    db.limit.mockResolvedValue({ data: null, error: { message: "network error" } });
    await expect(saveConfirmedScannedBill(draft)).rejects.toThrow("Could not check");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("Photo bill save permission and existing flow", () => {
  it("denies non-owners before any bill insert", async () => {
    db.rpc.mockResolvedValue({ data: false, error: null });
    await expect(saveConfirmedScannedBill(draft)).rejects.toThrow("Only the owner");
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("uses only the existing bills insert, omitting absent number and all generated columns", async () => {
    const saved = await saveConfirmedScannedBill(draft);
    expect(db.insert).toHaveBeenCalledExactlyOnceWith({ shop_id: "shop-1", bill_date: "2026-11-14", amount: 600 });
    expect(db.from.mock.calls).toEqual([["bills"], ["bills"]]);
    expect(saved).toMatchObject({ bill_number: "INV-2000", paid_amount: 0, balance: 600, status: "unpaid" });
  });
  it("keeps the database's existing global bill-number uniqueness constraint", async () => {
    db.single.mockResolvedValue({ data: null, error: { code: "23505" } });
    await expect(saveConfirmedScannedBill({ ...draft, billNumber: "B-12" })).rejects.toThrow("already exists");
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
});