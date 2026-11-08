import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, Search, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { inr, fmtDate, MODES, type PaymentMode } from "@/lib/format";
import { Card, Empty, StatusBadge } from "@/components/bits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WhatsAppReceiptDialog } from "@/components/whatsapp-receipt-dialog";

type Bill = { id: string; bill_number: string; bill_date: string; amount: number; paid_amount: number; balance: number; status: string; shop_id: string };

export function CollectPayment({ initialShopId = null }: { initialShopId?: string | null }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [shopId, setShopId] = useState<string | null>(initialShopId);
  const [bill, setBill] = useState<Bill | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<null | { phone: string | null; shopName: string; amount: number; mode: string; paidAt: string; outstanding: number }>(null);

  const { data: shops = [] } = useQuery({
    queryKey: ["collect-shops"],
    queryFn: async () => {
      const [{ data: s }, { data: b }] = await Promise.all([
        supabase.from("shops").select("id, name, address, phone").order("name"),
        supabase.from("bills").select("id, bill_number, bill_date, amount, paid_amount, balance, status, shop_id").neq("status", "paid").order("bill_date"),
      ]);
      return (s ?? []).map((shop) => {
        const bills = (b ?? []).filter((x) => x.shop_id === shop.id) as Bill[];
        return { ...shop, bills, due: bills.reduce((t, x) => t + Number(x.balance), 0) };
      });
    },
  });

  const filtered = useMemo(
    () => shops.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.due - a.due),
    [shops, q],
  );
  const shop = shops.find((s) => s.id === shopId);

  const submit = useMutation({
    mutationFn: async () => {
      if (!bill) throw new Error("Select a bill");
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("Enter a valid amount");
      if (amt > Number(bill.balance)) throw new Error(`Amount cannot exceed balance ${inr(bill.balance)}`);
      const paidAt = new Date().toISOString();
      const { error } = await supabase.from("payments").insert({
        bill_id: bill.id,
        shop_id: bill.shop_id,
        amount: amt,
        mode,
        reference: reference.trim() || null,
        paid_at: paidAt,
      } as never);
      if (error) throw error;
      const { data: updatedBills, error: balanceError } = await supabase.from("bills").select("balance").eq("shop_id", bill.shop_id);
      if (balanceError) throw balanceError;
      return { phone: shop?.phone ?? null, shopName: shop?.name ?? "Customer", amount: amt, mode, paidAt, outstanding: (updatedBills ?? []).reduce((sum, row) => sum + Number(row.balance), 0) };
    },
    onSuccess: (savedReceipt) => {
      toast.success("Payment recorded");
      setReceipt(savedReceipt);
      setBill(null);
      setAmount("");
      setReference("");
      setMode("cash");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (bill && shop) {
    return (
      <div className="space-y-4">
        <button onClick={() => setBill(null)} className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to bills
        </button>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">{shop.name}</div>
          <div className="mt-1 flex items-center justify-between">
            <div className="font-bold">{bill.bill_number}</div>
            <StatusBadge status={bill.status} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div><div className="text-muted-foreground">Bill</div><div className="tabular font-bold">{inr(bill.amount)}</div></div>
            <div><div className="text-muted-foreground">Paid</div><div className="tabular font-bold text-success">{inr(bill.paid_amount)}</div></div>
            <div><div className="text-muted-foreground">Balance</div><div className="tabular font-bold text-destructive">{inr(bill.balance)}</div></div>
          </div>
        </Card>

        <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="amt">Amount received (₹)</Label>
            <Input id="amt" inputMode="decimal" type="number" step="0.01" min="0.01" max={bill.balance} required value={amount} onChange={(e) => setAmount(e.target.value)} className="h-14 text-2xl font-bold tabular" />
            <button type="button" onClick={() => setAmount(String(bill.balance))} className="text-xs font-semibold text-success">
              Full balance {inr(bill.balance)}
            </button>
          </div>
          <div className="space-y-1.5">
            <Label>Payment mode</Label>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <button key={m.value} type="button" onClick={() => setMode(m.value)}
                  className={cn("h-12 rounded-lg border text-sm font-semibold", mode === m.value ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {mode !== "cash" && (
            <div className="space-y-1.5">
              <Label htmlFor="ref">{mode === "cheque" ? "Cheque number" : "Transaction reference"} (optional)</Label>
              <Input id="ref" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} />
            </div>
          )}
          <Button type="submit" className="h-14 w-full bg-success text-base text-success-foreground hover:bg-success/90" disabled={submit.isPending}>
            <CheckCircle2 className="h-5 w-5" /> {submit.isPending ? "Saving…" : "Submit payment"}
          </Button>
        </form>
      </div>
    );
  }

  if (shop) {
    return (
      <div className="space-y-3">
        <button onClick={() => setShopId(null)} className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> All shops
        </button>
        <div>
          <h2 className="text-lg font-bold">{shop.name}</h2>
          <p className="text-sm text-muted-foreground">Due: <span className="tabular font-bold text-destructive">{inr(shop.due)}</span></p>
        </div>
        {receipt && <WhatsAppReceiptDialog open={!!receipt} onOpenChange={open => !open && setReceipt(null)} {...receipt} />}
        {shop.bills.length === 0 ? <Empty>No pending bills for this shop.</Empty> : (
          <Card className="divide-y">
            {shop.bills.map((b) => (
              <button key={b.id} onClick={() => setBill(b)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                <div>
                  <div className="font-semibold">{b.bill_number}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(b.bill_date)} · Bill {inr(b.amount)}</div>
                </div>
                <div className="text-right">
                  <div className="tabular font-bold text-destructive">{inr(b.balance)}</div>
                  <StatusBadge status={b.status} />
                </div>
              </button>
            ))}
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search shop" value={q} onChange={(e) => setQ(e.target.value)} className="h-12 pl-9" />
      </div>
      {filtered.length === 0 ? <Empty>No shops found.</Empty> : (
        <Card className="divide-y">
          {filtered.map((s) => (
            <button key={s.id} onClick={() => setShopId(s.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
              <div className="min-w-0">
                <div className="truncate font-semibold">{s.name}</div>
                <div className="truncate text-xs text-muted-foreground">{s.bills.length} pending bill(s){s.address ? ` · ${s.address}` : ""}</div>
              </div>
              <div className={cn("tabular shrink-0 font-bold", s.due > 0 ? "text-destructive" : "text-success")}>{inr(s.due)}</div>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
