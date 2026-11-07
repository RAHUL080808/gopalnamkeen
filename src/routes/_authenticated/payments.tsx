import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { inr, fmtDateTime, modeLabel } from "@/lib/format";
import { Card, Empty, PageTitle } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { OwnerPaymentTools } from "@/components/owner-payment-tools";
import { cn } from "@/lib/utils";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/_authenticated/payments")({
  validateSearch: z.object({ tab: z.enum(["all", "corrections"]).optional() }),
  head: () => pageMeta("Payments — CreditBook", "Review shop payments and approve or reject payment corrections."),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { tab = "all" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div className="space-y-3">
      <PageTitle title="Payments" />
      <OwnerPaymentTools />
      <div className="flex gap-2">
        {(["all", "corrections"] as const).map((t) => (
          <button key={t} onClick={() => navigate({ search: { tab: t } })} className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", tab === t ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
            {t === "all" ? "All payments" : "Corrections"}
          </button>
        ))}
      </div>
      {tab === "all" ? <AllPayments /> : <Corrections />}
    </div>
  );
}

function AllPayments() {
  const { data = [] } = useQuery({
    queryKey: ["all-payments"],
    queryFn: async () => (await supabase.from("payments").select("*, shops(name), bills(bill_number)").order("paid_at", { ascending: false }).limit(500)).data ?? [],
  });
  if (!data.length) return <Empty>No payments yet.</Empty>;
  return (
    <Card className="divide-y">
      {data.map((p) => (
        <div key={p.id} className="flex items-start justify-between gap-3 p-3">
          <div className="min-w-0">
            <div className="truncate font-semibold">{p.shops?.name}</div>
            <div className="text-xs text-muted-foreground">{p.bills?.bill_number ?? "Without bill · Advance"} · {modeLabel(p.mode)}{p.reference ? ` · ${p.reference}` : ""}</div>
            {(p as any).remarks && <div className="mt-0.5 text-xs text-muted-foreground">Remark: {(p as any).remarks}</div>}
            <div className="text-xs text-muted-foreground"><span className="capitalize">{p.employee_name} ({p.employee_role})</span> · {fmtDateTime(p.paid_at)}</div>
          </div>
          <div className={cn("tabular font-bold", p.is_void ? "text-muted-foreground line-through" : "text-success")}>{inr(p.amount)}</div>
        </div>
      ))}
    </Card>
  );
}

function Corrections() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["corrections"],
    queryFn: async () => (await supabase.from("payment_corrections").select("*, payments(amount, mode, paid_at, employee_name, shops(name), bills(bill_number))").order("created_at", { ascending: false })).data ?? [],
  });
  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase.from("payment_corrections").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(v.status === "approved" ? "Correction applied" : "Correction rejected"); qc.invalidateQueries(); },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!data.length) return <Empty>No correction requests.</Empty>;
  return (
    <div className="space-y-3">
      {data.map((c) => (
        <Card key={c.id} className="p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{c.payments?.shops?.name} · {c.payments?.bills?.bill_number ?? "Without bill · Advance"}</div>
            <span className={cn("text-xs font-semibold capitalize", c.status === "pending" ? "text-warning-foreground" : c.status === "approved" ? "text-success" : "text-destructive")}>{c.status}</span>
          </div>
          <div className="mt-1 text-sm">
            Recorded: <b className="tabular">{inr(c.payments?.amount)}</b> {modeLabel(c.payments?.mode ?? "")} by {c.payments?.employee_name}
          </div>
          <div className="text-sm">
            Requested: {c.void_payment ? <b className="text-destructive">Void payment</b> : <b>{[c.new_amount != null && inr(c.new_amount), c.new_mode && modeLabel(c.new_mode)].filter(Boolean).join(" · ")}</b>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">“{c.reason}” — {c.requested_by_name}, {fmtDateTime(c.created_at)}</div>
          {c.status === "pending" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="flex-1 bg-success text-success-foreground hover:bg-success/90" disabled={review.isPending} onClick={() => review.mutate({ id: c.id, status: "approved" })}>Approve</Button>
              <Button size="sm" variant="outline" className="flex-1" disabled={review.isPending} onClick={() => review.mutate({ id: c.id, status: "rejected" })}>Reject</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
