import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, CalendarDays, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { inr, fmtDate } from "@/lib/format";
import { Card, Empty, PageTitle, StatusBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { BillDialog, DeleteBillButton } from "@/components/bill-dialog";
import { useMe } from "@/lib/session";
import { cn } from "@/lib/utils";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/_authenticated/bills")({
  head: () => pageMeta("Bills — CreditBook", "View shop bills and their paid, partial and outstanding balances."),
  component: BillsPage,
});

const FILTERS = [
  { v: "all", l: "All" },
  { v: "unpaid", l: "Unpaid" },
  { v: "partial", l: "Partial" },
  { v: "paid", l: "Paid" },
];

function BillsPage() {
  const [filter, setFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState("");
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<null | { id: string; shop_id: string; bill_date: string; amount: number; notes: string | null; paid_amount: number }>(null);
  const { data: bills = [] } = useQuery({
    queryKey: ["bills"],
    queryFn: async () => (await supabase.from("bills").select("*, shops(name)").order("bill_date", { ascending: false }).order("created_at", { ascending: false })).data ?? [],
  });
  const list = [...(filter === "all" ? bills : bills.filter((b) => b.status === filter))]
    .filter((b) => !selectedDate || b.bill_date === selectedDate);

  return (
    <div className="space-y-5">
      <PageTitle title="Bills" action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New bill</Button>} />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.v} onClick={() => setFilter(f.v)} className={cn("shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-all", filter === f.v ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border/70 bg-card text-muted-foreground hover:bg-muted")}>{f.l}</button>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm shadow-black/[0.03] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" /> Filter bills by date</div>
        <input id="bill-date-filter" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 sm:flex-none" />
        <button onClick={() => setSelectedDate(new Date().toLocaleDateString("en-CA"))} className={cn("rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors", selectedDate === new Date().toLocaleDateString("en-CA") ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted")}>Today</button>
        <button onClick={() => setSelectedDate("")} className={cn("rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors", !selectedDate ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted")}>All dates</button>
      </div>
      {list.length === 0 ? <Empty><div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-muted"><ReceiptText className="h-5 w-5" /></div><div className="font-semibold text-foreground">No bills found</div><div className="mt-1">Try another date or clear the filters.</div></Empty> : (
        <Card className="divide-y divide-border/70 overflow-hidden">
          {list.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40">
              <Link to="/shops/$id" params={{ id: b.shop_id }} className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="font-bold tracking-tight">{b.bill_number}</span><StatusBadge status={b.status} /></div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{b.shops?.name} · {fmtDate(b.bill_date)}</div>
              </Link>
              <div className="shrink-0 text-right">
                <div className="tabular text-sm font-extrabold tracking-tight">{inr(b.amount)}</div>
                <div className="tabular text-xs text-destructive">Bal {inr(b.balance)}</div>
              </div>
              {me?.role === "owner" && (
                <div className="flex items-center gap-1">
                  <button aria-label="Edit bill" onClick={() => setEdit(b)} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                  <DeleteBillButton billId={b.id} billNumber={b.bill_number} />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      <BillDialog open={open} onOpenChange={setOpen} />
      {edit && <BillDialog key={edit.id} open onOpenChange={(o) => !o && setEdit(null)} bill={edit} />}
    </div>
  );
}
