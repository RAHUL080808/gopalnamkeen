import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type EditBill = { id: string; shop_id: string; bill_date: string; amount: number; notes: string | null; paid_amount: number };

export function BillDialog({ open, onOpenChange, shopId, bill }: { open: boolean; onOpenChange: (o: boolean) => void; shopId?: string; bill?: EditBill }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [shop, setShop] = useState(bill?.shop_id ?? shopId ?? "");
  const [date, setDate] = useState(bill?.bill_date ?? today);
  const [amount, setAmount] = useState(bill ? String(bill.amount) : "");
  const [notes, setNotes] = useState(bill?.notes ?? "");

  const { data: shops = [] } = useQuery({
    queryKey: ["shop-options"],
    enabled: open && !shopId && !bill,
    queryFn: async () => (await supabase.from("shops").select("id, name").order("name")).data ?? [],
  });

  const m = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!shop) throw new Error("Select a shop");
      if (!(amt > 0)) throw new Error("Enter a valid amount");
      if (bill && amt < Number(bill.paid_amount)) throw new Error("Amount cannot be less than already paid");
      const row = { shop_id: shop, bill_date: date, amount: amt, notes: notes.trim() || null };
      const { error } = bill
        ? await supabase.from("bills").update({ bill_date: date, amount: amt, notes: row.notes }).eq("id", bill.id)
        : await supabase.from("bills").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(bill ? "Bill updated" : "Bill created");
      qc.invalidateQueries();
      if (!bill) { setAmount(""); setNotes(""); }
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{bill ? "Edit bill" : "New bill"}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          {!shopId && !bill && (
            <div className="space-y-1.5">
              <Label>Shop</Label>
              <select required className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={shop} onChange={(e) => setShop(e.target.value)}>
                <option value="">Select shop</option>
                {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5"><Label>Bill date</Label><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Bill amount (₹)</Label><Input type="number" inputMode="decimal" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Input maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">Bill number is generated automatically.</p>
          <Button type="submit" className="w-full" disabled={m.isPending}>Save bill</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
