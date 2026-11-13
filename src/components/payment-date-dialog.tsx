import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

function toLocalInputValue(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function PaymentDateDialog({
  paymentId,
  paidAt,
  onClose,
}: {
  paymentId: string;
  paidAt: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(toLocalInputValue(paidAt));

  const updateDate = useMutation({
    mutationFn: async () => {
      if (!value) throw new Error("Select payment date and time");
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) throw new Error("Enter a valid date and time");
      const { error } = await (supabase as any).rpc("owner_update_payment_date", {
        _payment_id: paymentId,
        _paid_at: date.toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Payment date updated");
      await qc.invalidateQueries();
      onClose();
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Update payment date & time</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); updateDate.mutate(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="payment-date-time">Payment date and time</Label>
            <Input
              id="payment-date-time"
              type="datetime-local"
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">The original and updated dates are saved in the payment edit history.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={updateDate.isPending}>{updateDate.isPending ? "Saving…" : "Save date"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
