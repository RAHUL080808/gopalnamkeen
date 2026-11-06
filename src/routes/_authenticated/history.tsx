import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";
import { inr, fmtDateTime, modeLabel, MODES, type PaymentMode } from "@/lib/format";
import { Card, Empty, PageTitle, Stat } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "My collections — CreditBook" }] }),
  component: HistoryPage,
});

type Pay = { id: string; amount: number; mode: string; paid_at: string; is_void: boolean; reference: string | null; bills: { bill_number: string } | null; shops: { name: string } | null };

function HistoryPage() {
  const { data: me } = useMe();
  const [target, setTarget] = useState<Pay | null>(null);
  const { data } = useQuery({
    queryKey: ["my-history", me?.id],
    enabled: !!me,
    queryFn: async () => {
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from("payments").select("id, amount, mode, paid_at, is_void, reference, bills(bill_number), shops(name)").eq("employee_id", me!.id).order("paid_at", { ascending: false }),
        supabase.from("payment_corrections").select("payment_id, status").eq("requested_by", me!.id),
      ]);
      return { payments: (p ?? []) as Pay[], corrections: c ?? [] };
    },
  });
  const pays = data?.payments ?? [];
  const today = new Date().toDateString();
  const active = pays.filter((p) => !p.is_void);

  return (
    <div className="space-y-4">
      <PageTitle title="My collections" />
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Today" value={inr(active.filter((p) => new Date(p.paid_at).toDateString() === today).reduce((s, p) => s + Number(p.amount), 0))} tone="success" />
        <Stat label="All time" value={inr(active.reduce((s, p) => s + Number(p.amount), 0))} tone="primary" />
      </div>
      {pays.length === 0 ? <Empty>No payments recorded yet.</Empty> : (
        <Card className="divide-y">
          {pays.map((p) => {
            const corr = data?.corrections.find((c) => c.payment_id === p.id && c.status === "pending");
            return (
              <div key={p.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p.shops?.name}</div>
                    <div className="text-xs text-muted-foreground">{p.bills?.bill_number} · {modeLabel(p.mode)}{p.reference ? ` · ${p.reference}` : ""}</div>
                    <div className="text-xs text-muted-foreground">{fmtDateTime(p.paid_at)}</div>
                  </div>
                  <div className={`tabular font-bold ${p.is_void ? "text-muted-foreground line-through" : ""}`}>{inr(p.amount)}</div>
                </div>
                <div className="mt-1 text-right">
                  {p.is_void ? <span className="text-xs text-destructive">Voided by owner</span>
                    : corr ? <span className="text-xs text-warning-foreground">Correction pending</span>
                    : <button className="text-xs font-semibold text-primary" onClick={() => setTarget(p)}>Request correction</button>}
                </div>
              </div>
            );
          })}
        </Card>
      )}
      <CorrectionDialog payment={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function CorrectionDialog({ payment, onClose }: { payment: Pay | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode | "">("");
  const [voidIt, setVoidIt] = useState(false);
  const m = useMutation({
    mutationFn: async () => {
      if (!payment) return;
      if (!voidIt && !amount && !mode) throw new Error("Enter a corrected amount or mode, or request a void");
      const { error } = await supabase.from("payment_corrections").insert({
        payment_id: payment.id,
        reason: reason.trim(),
        new_amount: voidIt || !amount ? null : Number(amount),
        new_mode: voidIt || !mode ? null : mode,
        void_payment: voidIt,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Correction sent to owner for approval");
      setReason(""); setAmount(""); setMode(""); setVoidIt(false);
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request correction</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <p className="text-sm text-muted-foreground">Current: {inr(payment?.amount)} · {modeLabel(payment?.mode ?? "")}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={voidIt} onChange={(e) => setVoidIt(e.target.checked)} /> Payment entered by mistake (void)</label>
          {!voidIt && (
            <>
              <div className="space-y-1.5"><Label>Correct amount (₹)</Label><Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Correct mode</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
                  <option value="">No change</option>
                  {MODES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="space-y-1.5"><Label>Reason</Label><Textarea required minLength={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <Button type="submit" className="w-full" disabled={m.isPending}>Send for approval</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
