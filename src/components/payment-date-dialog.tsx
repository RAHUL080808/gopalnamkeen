import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

function getDateParts(value: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date),
  };
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
  const initial = getDateParts(paidAt);
  const [dateValue, setDateValue] = useState(initial.date);
  const [timeValue, setTimeValue] = useState(initial.time);

  const updateDate = useMutation({
    mutationFn: async () => {
      const match = /^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/.exec(dateValue.trim());
      if (!match) throw new Error("Date DD/MM/YYYY format mein enter karein");
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const [hours, minutes] = timeValue.split(":").map(Number);
      const localDate = new Date(year, month - 1, day, hours, minutes);
      if (
        localDate.getFullYear() !== year ||
        localDate.getMonth() !== month - 1 ||
        localDate.getDate() !== day ||
        !Number.isInteger(hours) ||
        !Number.isInteger(minutes) ||
        hours < 0 || hours > 23 || minutes < 0 || minutes > 59
      ) throw new Error("Valid date aur time enter karein");
      const { error } = await (supabase as any).rpc("owner_update_payment_date", {
        _payment_id: paymentId,
        _paid_at: localDate.toISOString(),
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
            <Label htmlFor="payment-date">Payment date (DD/MM/YYYY)</Label>
            <Input
              id="payment-date"
              type="text"
              inputMode="numeric"
              placeholder="DD/MM/YYYY"
              maxLength={10}
              required
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-time">Payment time</Label>
            <Input
              id="payment-time"
              type="time"
              required
              value={timeValue}
              onChange={(event) => setTimeValue(event.target.value)}
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
