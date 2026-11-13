import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerPaymentTools } from "@/components/owner-payment-tools";

const calls = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: calls.from, rpc: calls.rpc } }));
vi.mock("@/components/whatsapp-receipt-dialog", () => ({ WhatsAppReceiptDialog: () => null }));
vi.mock("@/components/payment-tool-picker", () => ({
  PaymentToolPicker: ({ id, label, value, onChange, options, disabled }: {
    id: string; label: string; value: string; onChange: (value: string) => void;
    options: { value: string; label: string }[]; disabled?: boolean;
  }) => <select id={id} aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
    <option value="">Select</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>,
}));

function renderTools() {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false }, mutations: { retry: false } } });
  client.setQueryData(["owner-payment-shops"], []);
  client.setQueryData(["owner-payment-bills"], [
    { id: "bill-a", shop_id: "shop-1", bill_number: "Bill A", amount: 2000, balance: 1000 },
    { id: "bill-b", shop_id: "shop-1", bill_number: "Bill B", amount: 2000, balance: 2000 },
  ]);
  client.setQueryData(["owner-paymentsToAdjust"], [
    { id: "payment-1", shop_id: "shop-1", bill_id: null, amount: 1000,
      paid_at: "2026-11-13T10:00:00Z", remarks: null, reference: null,
      shops: { name: "Test shop" }, bills: null, payment_allocations: [] },
    { id: "payment-2", shop_id: "shop-1", bill_id: "bill-a", amount: 1000,
      paid_at: "2026-11-13T10:00:00Z", remarks: null, reference: null,
      shops: { name: "Test shop" }, bills: { bill_number: "Bill A" }, payment_allocations: [] },
  ]);
  return render(<QueryClientProvider client={client}><OwnerPaymentTools /></QueryClientProvider>);
}

beforeEach(() => {
  calls.from.mockReset().mockReturnValue({ insert: calls.insert });
  calls.insert.mockReset().mockResolvedValue({ error: null });
  calls.rpc.mockReset().mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("Owner payment tools initialization", () => {
  it("renders with a populated payment cache without reading state before initialization", () => {
    const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
    client.setQueryData(["owner-payment-shops"], []);
    client.setQueryData(["owner-payment-bills"], []);
    client.setQueryData(["owner-paymentsToAdjust"], [{
      id: "payment-1", shop_id: "shop-1", bill_id: null, amount: 1000,
      paid_at: "2026-11-13T10:00:00Z", remarks: null, reference: null,
      shops: { name: "Test shop" }, bills: null, payment_allocations: [],
    }]);
    expect(() => render(
      <QueryClientProvider client={client}><OwnerPaymentTools /></QueryClientProvider>,
    )).not.toThrow();
  });
});

describe("Independent payment workflows", () => {
  it("adjusts ₹600 only after confirmation, using the original allocation mutation", async () => {
    renderTools();
    fireEvent.click(screen.getByRole("button", { name: "Adjust Payment" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Select Payment" }), { target: { value: "payment-1" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Select Bill" }), { target: { value: "bill-a" } });
    fireEvent.change(within(dialog).getByLabelText("3. Enter Amount (₹)"), { target: { value: "600" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Adjust Payment" }));
    expect(calls.from).not.toHaveBeenCalled();
    expect(calls.rpc).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Haan, confirm karein" }));
    await waitFor(() => expect(calls.insert).toHaveBeenCalledExactlyOnceWith({ payment_id: "payment-1", bill_id: "bill-a", amount: 600 }));
    expect(calls.from).toHaveBeenCalledExactlyOnceWith("payment_allocations");
    expect(calls.rpc).not.toHaveBeenCalled();
  });

  it("transfers ₹400 only through the existing RPC after confirmation", async () => {
    renderTools();
    fireEvent.click(screen.getByRole("button", { name: "Transfer Payment" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Select Payment" }), { target: { value: "payment-2" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Select To Bill" }), { target: { value: "bill-b" } });
    fireEvent.change(within(dialog).getByLabelText("4. Enter Amount (₹)"), { target: { value: "400" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Transfer Payment" }));
    expect(calls.rpc).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Haan, confirm karein" }));
    await waitFor(() => expect(calls.rpc).toHaveBeenCalledExactlyOnceWith("owner_transfer_bill_payment", {
      _payment_id: "payment-2", _source_bill_id: "bill-a", _target_bill_id: "bill-b", _amount: 400,
      _reason: "Owner transferred payment between bills",
    }));
    expect(calls.from).not.toHaveBeenCalled();
  });

  it("cancelling a confirmation sends no payment mutations", () => {
    renderTools();
    fireEvent.click(screen.getByRole("button", { name: "Adjust Payment" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Select Payment" }), { target: { value: "payment-1" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Select Bill" }), { target: { value: "bill-a" } });
    fireEvent.change(within(dialog).getByLabelText("3. Enter Amount (₹)"), { target: { value: "600" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Adjust Payment" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(calls.from).not.toHaveBeenCalled();
    expect(calls.rpc).not.toHaveBeenCalled();
  });

  it("retains adjustment selections separately when the transfer form is used", () => {
    renderTools();
    fireEvent.click(screen.getByRole("button", { name: "Adjust Payment" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Select Payment" }), { target: { value: "payment-1" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Select Bill" }), { target: { value: "bill-a" } });
    fireEvent.change(within(dialog).getByLabelText("3. Enter Amount (₹)"), { target: { value: "600" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Transfer Payment" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Select Payment" }), { target: { value: "payment-2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Adjust Payment" }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: "Select Payment" })).toHaveValue("payment-1");
    expect(within(dialog).getByRole("combobox", { name: "Select Bill" })).toHaveValue("bill-a");
    expect(within(dialog).getByLabelText("3. Enter Amount (₹)")).toHaveValue(600);
    expect(calls.from).not.toHaveBeenCalled();
    expect(calls.rpc).not.toHaveBeenCalled();
  });
});