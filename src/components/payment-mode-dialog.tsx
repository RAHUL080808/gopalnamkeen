import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MODES, modeLabel, type PaymentMode } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PaymentModeDialog({
  paymentId,
  currentMode,
  onClose,
}: {
  paymentId: string;
  currentMode: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<PaymentMode>(currentMode as PaymentMode);

  const updateMode = useMutation({
    mutationFn: async () => {
      if (!MODES.some((item) => item.value === mode)) throw new Error("Select a valid payment type");
      const { error } = await (supabase as any).rpc("owner_update_payment_mode", {
        _payment_id: paymentId,
        _new_mode: mode,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Payment type updated");
      await qc.invalidateQueries();
      onClose();
    },
    onError: (error) => toast.error((error as Error).message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change payment type</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Current type: {modeLabel(currentMode)}</p>
          <Select value={mode} onValueChange={(value) => setMode(value as PaymentMode)}>
            <SelectTrigger aria-label="New payment type">
              <SelectValue placeholder="Select payment type" />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Only the payment type will change. Amount, bill allocation and outstanding balance will remain unchanged. The change is saved in payment history.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={updateMode.isPending || mode === currentMode} onClick={() => updateMode.mutate()}>
            {updateMode.isPending ? "Saving…" : "Save type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
