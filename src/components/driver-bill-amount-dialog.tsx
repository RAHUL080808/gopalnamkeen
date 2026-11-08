import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type DriverBill = { id: string; bill_number: string; amount: number; paid_amount: number };

export function DriverBillAmountDialog({ bill, onClose }: { bill: DriverBill; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(bill.amount));
  const mutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a valid bill amount");
      if (value < Number(bill.paid_amount)) throw new Error("New amount cannot be less than the amount already received");
      const { error } = await (supabase.rpc as any)("driver_update_bill_amount", {
        _bill_id: bill.id,
        _new_amount: value,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Bill amount updated");
      await qc.invalidateQueries();
      onClose();
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit amount · {bill.bill_number}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
          <div className="rounded-xl bg-muted p-3 text-sm">
            Current amount: <b>{inr(bill.amount)}</b><br />
            Already received: <b>{inr(bill.paid_amount)}</b>
          </div>
          <div className="space-y-1.5">
            <Label>Final bill amount (₹)</Label>
            <Input type="number" inputMode="decimal" min={bill.paid_amount} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Only the bill amount can be changed. Payment records remain unchanged.</p>
          <Button className="w-full" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save amount"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
