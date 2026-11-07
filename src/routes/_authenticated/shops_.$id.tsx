import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { inr, fmtDate, fmtDateTime, modeLabel } from "@/lib/format";
import { Card, Empty, Stat, StatusBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { BillDialog } from "@/components/bill-dialog";
import { ShopDialog } from "./shops";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/_authenticated/shops_/$id")({
  head: () => pageMeta("Shop details — CreditBook", "View a shop's contact details, bills, payments and outstanding credit."),
  component: ShopDetail,
});

function ShopDetail() {
  const { id } = Route.useParams();
  const [billOpen, setBillOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["shop", id],
    queryFn: async () => {
      const [{ data: shop }, { data: bills }, { data: pays }] = await Promise.all([
        supabase.from("shops").select("*").eq("id", id).maybeSingle(),
        supabase.from("bills").select("*").eq("shop_id", id).order("bill_date", { ascending: false }),
        (supabase.from("payments") as any).select("id, bill_id, amount, mode, paid_at, employee_name, is_void, reference, remarks, bills(bill_number), payment_allocations(amount, bills(bill_number))").eq("shop_id", id).order("paid_at", { ascending: false }),
      ]);
      return { shop, bills: bills ?? [], pays: pays ?? [] };
    },
  });
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data.shop) return <Empty>Shop not found.</Empty>;
  const { shop, bills, pays } = data;
  const total = bills.reduce((s, b) => s + Number(b.amount), 0);
  const due = bills.reduce((s, b) => s + Number(b.balance), 0);
  const unallocatedAdvance = pays.filter((p: any) => p.bill_id === null && !p.is_void).reduce((sum: number, p: any) => sum + Math.max(0, Number(p.amount) - (p.payment_allocations ?? []).reduce((a: number, x: any) => a + Number(x.amount), 0)), 0);

  return (
    <div className="space-y-4">
      <Link to="/shops" className="flex items-center gap-1 text-sm font-medium text-muted-foreground"><ChevronLeft className="h-4 w-4" /> Shops</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">{shop.name}</h1>
          <p className="text-sm text-muted-foreground">{[shop.contact_name, shop.phone, shop.address].filter(Boolean).join(" · ")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Billed" value={inr(total)} tone="primary" />
        <Stat label="Received" value={inr(total - due)} tone="success" />
        <Stat label="Due" value={inr(due)} tone="danger" />
        <Stat label="Unallocated advance" value={inr(unallocatedAdvance)} tone="primary" />
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-muted-foreground">Bills</h2>
        <Button size="sm" onClick={() => setBillOpen(true)}><Plus className="h-4 w-4" /> New bill</Button>
      </div>
      {bills.length === 0 ? <Empty>No bills yet.</Empty> : (
        <Card className="divide-y">
          {bills.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 p-3">
              <div><div className="font-semibold">{b.bill_number}</div><div className="text-xs text-muted-foreground">{fmtDate(b.bill_date)} · {inr(b.amount)}</div></div>
              <div className="text-right"><div className="tabular font-bold">{inr(b.balance)}</div><StatusBadge status={b.status} /></div>
            </div>
          ))}
        </Card>
      )}
      <h2 className="text-sm font-bold text-muted-foreground">Payments</h2>
      {pays.length === 0 ? <Empty>No payments yet.</Empty> : (
        <Card className="divide-y">
          {pays.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 p-3">
              <div><div className="text-sm font-semibold">{p.bills?.bill_number ?? "Without bill · Advance"} · {modeLabel(p.mode)}</div><div className="text-xs text-muted-foreground">{p.employee_name} · {fmtDateTime(p.paid_at)}</div>{p.reference && <div className="text-xs text-muted-foreground">Ref: {p.reference}</div>}{p.remarks && <div className="text-xs text-muted-foreground">Remark: {p.remarks}</div>}{p.payment_allocations?.length > 0 && <div className="text-xs text-muted-foreground">Allocated: {p.payment_allocations.map((a: any) => `${a.bills?.bill_number ?? "Bill"} ${inr(a.amount)}`).join(" · ")}</div>}</div>
              <div className={`tabular font-bold ${p.is_void ? "text-muted-foreground line-through" : "text-success"}`}>{inr(p.amount)}</div>
            </div>
          ))}
        </Card>
      )}
      <BillDialog open={billOpen} onOpenChange={setBillOpen} shopId={id} />
      {editOpen && <ShopDialog open={editOpen} onOpenChange={setEditOpen} shop={{ id: shop.id, name: shop.name, contact_name: shop.contact_name ?? "", phone: shop.phone ?? "", address: shop.address ?? "" }} />}
    </div>
  );
}
