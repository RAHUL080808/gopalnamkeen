import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CATEGORIES = [
  { value: "shop_closed", label: "Shop was closed" },
  { value: "not_delivered", label: "Goods were not delivered" },
  { value: "shop_refused", label: "Shop refused the goods" },
  { value: "other", label: "Other reason" },
];

export function ReturnBillButton({ billId, billNumber, paidAmount = 0, disabled = false }: {
  billId: string;
  billNumber: string;
  paidAmount?: number;
  disabled?: boolean;
}) {
  // Paid and partially paid bills must never show the return action.
  if (Number(paidAmount) > 0) return null;
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("shop_closed");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as any)("owner_return_bill", {
        _bill_id: billId,
        _category: category,
        _reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Bill marked as returned. It is excluded from sales and outstanding; proof is preserved.");
      await qc.invalidateQueries();
      setOpen(false);
      setReason("");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        <RotateCcw className="h-4 w-4" /> Return bill
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return bill {billNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              This bill will be removed from active sales and outstanding. The original bill and return reason will remain saved as proof. This action cannot be undone.
            </div>
            <div className="space-y-1.5">
              <Label>Return reason</Label>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Details / proof note</Label>
              <Input autoFocus maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Shop permanently closed; goods not delivered" />
              <p className="text-xs text-muted-foreground">Enter at least 5 characters. This note is saved with the original bill.</p>
            </div>
            <Button className="w-full" disabled={mutation.isPending || reason.trim().length < 5} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Saving return…" : "Confirm return bill"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
