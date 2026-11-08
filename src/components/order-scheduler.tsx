import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inr } from "@/lib/format";

function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

type BillRow = { id: string; bill_number: string; bill_date: string; amount: number; balance: number; shop_id: string; shops: { id: string; name: string } | null };

export function OrderScheduler() {
  const qc = useQueryClient();
  const [visitDate, setVisitDate] = useState(localDate());
  const [billDate, setBillDate] = useState(localDate(-1));
  const [selected, setSelected] = useState<string[]>([]);

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["order-scheduler-bills", billDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("id, bill_number, bill_date, amount, balance, shop_id, shops(id, name)")
        .eq("bill_date", billDate)
        .order("bill_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BillRow[];
    },
  });

  const { data: existing = [] } = useQuery({
    queryKey: ["order-scheduler-existing", visitDate, billDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_order_bills")
        .select("bill_id")
        .eq("visit_date", visitDate)
        .eq("bill_date", billDate);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    setSelected(bills.map((b) => b.id));
  }, [bills]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedBills = bills.filter((b) => selectedSet.has(b.id));
  const selectedShops = new Set(selectedBills.map((b) => b.shop_id)).size;

  const save = useMutation({
    mutationFn: async () => {
      const existingIds = existing.map((x) => x.bill_id);
      const removeIds = existingIds.filter((id) => !selectedSet.has(id));
      for (const id of removeIds) {
        const { error } = await (supabase as any).from("daily_order_bills").delete().eq("bill_id", id).eq("visit_date", visitDate);
        if (error) throw error;
      }
      if (selectedBills.length) {
        const rows = selectedBills.map((b) => ({ bill_id: b.id, bill_date: billDate, visit_date: visitDate }));
        const { error } = await (supabase as any).from("daily_order_bills").upsert(rows, { onConflict: "bill_id" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Driver ke orders schedule ho gaye");
      qc.invalidateQueries({ queryKey: ["order-scheduler-existing"] });
      qc.invalidateQueries({ queryKey: ["staff-todays-orders"] });
      qc.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggle = (id: string, checked: boolean) => {
    setSelected((old) => checked ? [...old, id] : old.filter((x) => x !== id));
  };

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></span>
        <div><h2 className="text-base font-extrabold">Schedule driver orders</h2><p className="mt-0.5 text-xs text-muted-foreground">Choose the visit date and the bill date. All bills from that bill date are selected automatically.</p></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Driver visit date</Label><Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Bills dated</Label><Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></div>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
        <div><p className="text-xs font-bold">{bills.length} bills found · {selectedShops} shops selected</p><p className="text-[11px] text-muted-foreground">Uncheck any bill you do not want the driver to see in this visit.</p></div>
        <button type="button" className="text-xs font-bold text-primary" onClick={() => setSelected(bills.map((b) => b.id))}>Select all</button>
      </div>
      {isLoading ? <div className="py-6 text-center text-sm text-muted-foreground">Loading bills…</div> : bills.length === 0 ? (
        <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Is date par koi bill nahi mila.</div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {bills.map((bill) => (
            <label key={bill.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 p-3 transition hover:bg-muted/40">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={selectedSet.has(bill.id)} onChange={(e) => toggle(bill.id, e.target.checked)} />
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Store className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{bill.shops?.name ?? "Shop"}</span><span className="block text-[11px] text-muted-foreground">Bill #{bill.bill_number} · Due {inr(Number(bill.balance))}</span></span>
              <span className="text-xs font-extrabold tabular">{inr(Number(bill.amount))}</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <p className="text-xs text-muted-foreground">{selectedBills.length} bills · {inr(selectedBills.reduce((sum, b) => sum + Number(b.amount), 0))} total</p>
        <Button type="button" disabled={save.isPending || isLoading} onClick={() => save.mutate()}><Check className="mr-2 h-4 w-4" />{save.isPending ? "Saving…" : "Save driver list"}</Button>
      </div>
    </Card>
  );
}
