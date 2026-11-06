import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { inr, fmtDate } from "@/lib/format";
import { Card, Empty, PageTitle, StatusBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { BillDialog } from "@/components/bill-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/bills")({
  head: () => ({ meta: [{ title: "Bills — CreditBook" }] }),
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
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<null | { id: string; shop_id: string; bill_date: string; amount: number; notes: string | null; paid_amount: number }>(null);
  const { data: bills = [] } = useQuery({
    queryKey: ["bills"],
    queryFn: async () => (await supabase.from("bills").select("*, shops(name)").order("bill_date", { ascending: false }).order("created_at", { ascending: false })).data ?? [],
  });
  const list = filter === "all" ? bills : bills.filter((b) => b.status === filter);

  return (
    <div className="space-y-3">
      <PageTitle title="Bills" action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New bill</Button>} />
      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button key={f.v} onClick={() => setFilter(f.v)} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", filter === f.v ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{f.l}</button>
        ))}
      </div>
      {list.length === 0 ? <Empty>No bills.</Empty> : (
        <Card className="divide-y">
          {list.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-3">
              <Link to="/shops/$id" params={{ id: b.shop_id }} className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="font-semibold">{b.bill_number}</span><StatusBadge status={b.status} /></div>
                <div className="truncate text-xs text-muted-foreground">{b.shops?.name} · {fmtDate(b.bill_date)}</div>
              </Link>
              <div className="text-right">
                <div className="tabular text-sm font-bold">{inr(b.amount)}</div>
                <div className="tabular text-xs text-destructive">Bal {inr(b.balance)}</div>
              </div>
              <button aria-label="Edit bill" onClick={() => setEdit(b)} className="p-1 text-muted-foreground"><Pencil className="h-4 w-4" /></button>
            </div>
          ))}
        </Card>
      )}
      <BillDialog open={open} onOpenChange={setOpen} />
      {edit && <BillDialog key={edit.id} open onOpenChange={(o) => !o && setEdit(null)} bill={edit} />}
    </div>
  );
}
