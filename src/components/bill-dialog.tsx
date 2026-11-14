import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type EditBill = { id: string; shop_id: string; bill_date: string; amount: number; notes: string | null; paid_amount: number };

export function BillDialog({ open, onOpenChange, shopId, bill, driverMode = false }: { open: boolean; onOpenChange: (o: boolean) => void; shopId?: string; bill?: EditBill; driverMode?: boolean }) {
  const qc = useQueryClient();
  const today = new Date().toLocaleDateString("en-CA");
  const [shop, setShop] = useState(bill?.shop_id ?? shopId ?? "");
  const [shopSearch, setShopSearch] = useState("");
  const [date, setDate] = useState(bill?.bill_date ?? today);
  const [amount, setAmount] = useState(bill ? String(bill.amount) : "");
  const [notes, setNotes] = useState(bill?.notes ?? "");

  const { data: shops = [] } = useQuery({
    queryKey: ["shop-options"],
    enabled: open && !shopId && !bill,
    queryFn: async () => (await supabase.from("shops").select("id, name").order("name")).data ?? [],
  });

  const filteredShops = shops.filter((s) => s.name.toLowerCase().includes(shopSearch.trim().toLowerCase()));

  const m = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!shop) throw new Error("Select a shop");
      if (!(amt > 0)) throw new Error("Enter a valid amount");
      if (bill && amt < Number(bill.paid_amount)) throw new Error("Amount cannot be less than already paid");
      const row = { shop_id: shop, bill_date: date, amount: amt, notes: notes.trim() || null };
      if (bill) {
        const { error } = await supabase.from("bills").update({ bill_date: date, amount: amt, notes: row.notes }).eq("id", bill.id);
        if (error) throw error;
      } else if (driverMode) {
        const { error } = await (supabase.rpc as any)("driver_create_bill", {
          _shop_id: shop,
          _bill_date: date,
          _amount: amt,
          _notes: row.notes,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bills").insert(row);
        if (error) throw error;
      }
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
        <DialogHeader><DialogTitle>{bill ? "Edit bill" : driverMode ? "Add delivery bill" : "Add bill"}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          {!shopId && !bill && (
            <div className="space-y-1.5">
              <Label>Shop</Label>
              <Input
                type="search"
                placeholder="Type shop name to search..."
                value={shopSearch}
                onChange={(e) => setShopSearch(e.target.value)}
                aria-label="Search shops"
              />
              <select required className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={shop} onChange={(e) => setShop(e.target.value)}>
                <option value="">Select shop ({filteredShops.length} found)</option>
                {filteredShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {shopSearch && filteredShops.length === 0 && <p className="text-xs text-muted-foreground">No shops found. Check the spelling or clear the search.</p>}
            </div>
          )}
          <div className="space-y-1.5"><Label>Bill date</Label><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Bill amount (₹)</Label><Input type="number" inputMode="decimal" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Input maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">{driverMode ? "Delivery bill will be recorded under your account. Bill number is generated automatically." : "Bill number is generated automatically."}</p>
          <Button type="submit" className="w-full" disabled={m.isPending}>Save bill</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}


export function DeleteBillButton({ billId, billNumber }: { billId: string; billNumber: string }) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as any)("owner_delete_bill_with_payments", { _bill_id: billId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bill and linked payment history deleted");
      qc.invalidateQueries();
      setConfirmOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <Button type="button" variant="ghost" size="icon" aria-label="Delete bill" onClick={() => setConfirmOpen(true)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete bill {billNumber} and its payment history?</AlertDialogTitle>
          <AlertDialogDescription>
            This is permanent. The bill and all payments directly recorded against it, including their correction history, will be deleted. Any advance payment allocated to this bill will remain in payment history, but its allocation to this bill will be removed. Use this only for test or incorrect records.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={m.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => m.mutate()}>
            {m.isPending ? "Deleting…" : "Delete bill and payments"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
