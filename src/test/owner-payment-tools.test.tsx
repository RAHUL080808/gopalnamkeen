import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { OwnerPaymentTools } from "@/components/owner-payment-tools";

vi.mock("@/components/whatsapp-receipt-dialog", () => ({ WhatsAppReceiptDialog: () => null }));

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