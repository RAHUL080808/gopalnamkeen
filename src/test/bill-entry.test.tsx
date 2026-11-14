import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BillEntryDialog } from "@/components/bill-entry-dialog";

const mocks = vi.hoisted(() => ({ role: "owner", from: vi.fn(), insert: vi.fn(), rpc: vi.fn(), scan: vi.fn(), save: vi.fn(), duplicate: vi.fn() }));
vi.mock("@/lib/session", () => ({ useMe: () => ({ data: { role: mocks.role, id: "user-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock("@/lib/bill-ocr", () => ({ scanBillImage: mocks.scan }));
vi.mock("@/lib/bill-scan-save", () => ({ findScannedBillDuplicates: mocks.duplicate, saveConfirmedScannedBill: mocks.save }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/components/payment-tool-picker", () => ({ PaymentToolPicker: ({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) => <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}><option value="">Select</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }));

beforeEach(() => {
  mocks.role = "owner";
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  mocks.scan.mockReset().mockResolvedValue({ text: "Shop: Ravi Stores\nDate: 14/11/2026\nBill No: PHOTO-12\nGrand Total: 600", confidence: 95 });
  mocks.duplicate.mockReset().mockResolvedValue([]);
  mocks.save.mockReset().mockResolvedValue({ bill_number: "PHOTO-12" });
  const chain = { select: vi.fn(), order: vi.fn(), range: vi.fn(), insert: mocks.insert };
  chain.select.mockReturnValue(chain); chain.order.mockReturnValue(chain);
  chain.range.mockResolvedValue({ data: [{ id: "shop-1", name: "Ravi Stores", area: "Market", contact_name: "Ravi" }], error: null });
  mocks.from.mockReset().mockReturnValue(chain);
  URL.createObjectURL = vi.fn(() => "blob:local-test"); URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);
function setup(driverMode = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(["shop-options"], [{ id: "shop-1", name: "Ravi Stores" }]);
  return render(<QueryClientProvider client={client}><BillEntryDialog open onOpenChange={vi.fn()} driverMode={driverMode} /></QueryClientProvider>);
}

describe("Unchanged manual entry", () => {
  it("opens the original owner form and sends the original manual insert payload", async () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "shop-1" } });
    fireEvent.change(within(dialog).getByRole("spinbutton"), { target: { value: "600" } });
    const notes = within(dialog).getByRole("textbox");
    fireEvent.change(notes, { target: { value: " Manual notes " } });
    const date = dialog.querySelector('input[type="date"]');
    if (!date) throw new Error("Manual date input missing");
    fireEvent.change(date, { target: { value: "2026-11-14" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save bill" }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({ shop_id: "shop-1", bill_date: "2026-11-14", amount: 600, notes: "Manual notes" }));
    expect(mocks.scan).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("preserves driver manual entry through the existing driver_create_bill RPC, without photo access", async () => {
    mocks.role = "driver"; setup(true);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "shop-1" } });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: "Save bill" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("driver_create_bill", expect.objectContaining({ _shop_id: "shop-1", _amount: 600, _notes: null })));
    expect(mocks.scan).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("Photo confirmation", () => {
  it("does not select or create a shop automatically after OCR", async () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Photo" }));
    fireEvent.change(screen.getByLabelText("Upload bill photo"), { target: { files: [new File(["image"], "bill.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(screen.getByLabelText("Total amount (₹) *")).toHaveValue(600));
    expect(screen.getByRole("combobox", { name: "Shop" })).toHaveValue("");
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not save on OCR or shop selection, and saves corrected details only after confirmation", async () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Photo" }));
    fireEvent.change(screen.getByLabelText("Upload bill photo"), { target: { files: [new File(["image"], "bill.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(screen.getByLabelText("Total amount (₹) *")).toHaveValue(600));
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox", { name: "Shop" }), { target: { value: "shop-1" } });
    fireEvent.change(screen.getByLabelText("Total amount (₹) *"), { target: { value: "650" } });
    fireEvent.change(screen.getByLabelText("Bill number (optional)"), { target: { value: "" } });
    const confirm = screen.getByRole("button", { name: "Confirm & Save" });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ shopId: "shop-1", billDate: "2026-11-14", amount: "650", billNumber: "" }));
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("blocks a possible duplicate before confirmation can insert", async () => {
    mocks.duplicate.mockResolvedValue([{ id: "existing", bill_number: "PHOTO-12", bill_date: "2026-11-14", amount: 600 }]);
    setup(); fireEvent.click(screen.getByRole("button", { name: "Photo" }));
    fireEvent.change(screen.getByLabelText("Take bill photo"), { target: { files: [new File(["image"], "camera.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(screen.getByLabelText("Total amount (₹) *")).toHaveValue(600));
    fireEvent.change(screen.getByRole("combobox", { name: "Shop" }), { target: { value: "shop-1" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm & Save" })).toBeDisabled());
    await waitFor(() => expect(mocks.duplicate).toHaveBeenCalled());
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("does not retry a failed save automatically or discard corrected input", async () => {
    mocks.save.mockRejectedValue(new Error("Bill could not be saved"));
    setup(); fireEvent.click(screen.getByRole("button", { name: "Photo" }));
    fireEvent.change(screen.getByLabelText("Upload bill photo"), { target: { files: [new File(["image"], "bill.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(screen.getByLabelText("Total amount (₹) *")).toHaveValue(600));
    fireEvent.change(screen.getByRole("combobox", { name: "Shop" }), { target: { value: "shop-1" } });
    const confirm = screen.getByRole("button", { name: "Confirm & Save" });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Total amount (₹) *")).toHaveValue(600);
  });
});