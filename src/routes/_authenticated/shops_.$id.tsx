import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { inr, fmtDate, fmtDateTime, modeLabel } from "@/lib/format";
import { Card, Empty, Stat, StatusBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { BillDialog, DeleteBillButton } from "@/components/bill-dialog";
import { ShopDialog } from "./shops";
import { pageMeta } from "@/lib/page-meta";
import { useMe } from "@/lib/session";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/shops_/$id")({
  head: () => pageMeta("Shop details — CreditBook", "View a shop's contact details, bills, payments and outstanding credit."),
  component: ShopDetail,
});

function ShopDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [billOpen, setBillOpen] = useState(false);
  const [editBill, setEditBill] = useState<null | { id: string; shop_id: string; bill_date: string; amount: number; notes: string | null; paid_amount: number }>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteShopOpen, setDeleteShopOpen] = useState(false);
  const deleteShop = useMutation({
    mutationFn: async () => {
      const [{ data: existingBills, error: billsError }, { data: existingPayments, error: paymentsError }] = await Promise.all([
        supabase.from("bills").select("id").eq("shop_id", id).limit(1),
        supabase.from("payments").select("id").eq("shop_id", id).limit(1),
      ]);
      if (billsError) throw billsError;
      if (paymentsError) throw paymentsError;
      if ((existingBills?.length ?? 0) > 0 || (existingPayments?.length ?? 0) > 0) {
        throw new Error("Is shop ke bills ya payment history maujood hai. Pehle records ka hisaab sambhale bina shop delete nahi ho sakti.");
      }
      const { error } = await supabase.from("shops").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Shop deleted");
      await qc.invalidateQueries();
      navigate({ to: "/shops" });
    },
    onError: (e) => toast.error((e as Error).message),
  });
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
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#132443] via-[#20395f] to-[#315477] p-5 text-white shadow-xl shadow-slate-900/10 sm:p-7"><div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border-[25px] border-white/[0.06]" /><div className="relative"><Link to="/shops" className="inline-flex items-center gap-1 text-xs font-bold text-white/65 transition hover:text-white"><ChevronLeft className="h-4 w-4" /> Back to shops</Link><div className="mt-4 flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/55">Retailer account</div><h1 className="mt-2 break-words text-2xl font-extrabold tracking-tight sm:text-3xl">{shop.name}</h1><p className="mt-1 text-xs leading-relaxed text-white/65">{[shop.contact_name, shop.phone, shop.address].filter(Boolean).join(" · ") || "No contact details added"}</p></div>{me?.role === "owner" && <div className="flex shrink-0 flex-col gap-2 sm:flex-row"><Button variant="outline" size="sm" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button><Button variant="outline" size="sm" className="border-white/20 bg-white/10 text-white hover:bg-rose-500/20 hover:text-white" onClick={() => setDeleteShopOpen(true)}><Trash2 className="h-4 w-4" /> Delete</Button></div>}</div></div></section>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Billed" value={inr(total)} tone="primary" />
        <Stat label="Received" value={inr(total - due)} tone="success" />
        <Stat label="Due" value={inr(due)} tone="danger" />
        <Stat label="Unallocated advance" value={inr(unallocatedAdvance)} tone="primary" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-base font-extrabold tracking-tight">Bills</h2><p className="text-xs text-muted-foreground">Invoices and remaining balances</p></div>
        <Button size="sm" onClick={() => setBillOpen(true)}><Plus className="h-4 w-4" /> New bill</Button>
      </div>
      {bills.length === 0 ? <Empty>No bills yet.</Empty> : (
        <Card className="divide-y">
          {bills.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 p-3">
              <div><div className="font-semibold">{b.bill_number}</div><div className="text-xs text-muted-foreground">{fmtDate(b.bill_date)} · {inr(b.amount)}</div></div>
              <div className="text-right"><div className="tabular font-bold">{inr(b.balance)}</div><StatusBadge status={b.status} /></div>
              {me?.role === "owner" && (
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label="Edit bill" onClick={() => setEditBill(b)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DeleteBillButton billId={b.id} billNumber={b.bill_number} />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      <div><h2 className="text-base font-extrabold tracking-tight">Payments</h2><p className="text-xs text-muted-foreground">Payment and advance history</p></div>
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
      {editBill && <BillDialog key={editBill.id} open onOpenChange={(o) => !o && setEditBill(null)} bill={editBill} />}
      <AlertDialog open={deleteShopOpen} onOpenChange={setDeleteShopOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shop {shop.name}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. A shop can be deleted only when it has no bills and no payment history, so financial records remain safe.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleteShop.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteShop.mutate()}>
              {deleteShop.isPending ? "Deleting…" : "Delete shop"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {editOpen && <ShopDialog open={editOpen} onOpenChange={setEditOpen} shop={{ id: shop.id, name: shop.name, contact_name: shop.contact_name ?? "", phone: shop.phone ?? "", address: shop.address ?? "" }} />}
    </div>
  );
}
