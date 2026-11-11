import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { inr, fmtDateTime, modeLabel } from "@/lib/format";
import { Card, Empty } from "@/components/bits";
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
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#132443] via-[#20395f] to-[#315477] p-5 text-white shadow-xl shadow-slate-900/10 sm:p-7"><div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border-[25px] border-white/[0.06]" /><div className="relative"><div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/55">Money movement</div><h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Payments</h1><p className="mt-1 text-xs text-white/65">Review collections, Without Bill Payments and correction requests.</p></div></div>
      <OwnerPaymentTools />
      <div className="flex gap-2 rounded-2xl border border-border/70 bg-muted/60 p-1.5">
        {(["all", "corrections"] as const).map((t) => (
          <button key={t} onClick={() => navigate({ search: { tab: t } })} className={cn("rounded-xl border px-4 py-2 text-sm font-semibold transition-all", tab === t ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
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
    queryFn: async () => (await supabase.from("payments").select("*, shops(name), bills(bill_number), payment_allocations(amount, bills(bill_number))").order("paid_at", { ascending: false }).limit(500)).data ?? [],
  });
  if (!data.length) return <Empty>No payments yet.</Empty>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.map((p) => (
        <Card key={p.id} className="group relative overflow-hidden border-border/70 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
          <div className={cn("absolute inset-x-0 top-0 h-1", p.is_void ? "bg-muted-foreground/40" : "bg-gradient-to-r from-emerald-500 to-teal-400")} />
          <div className="flex items-start justify-between gap-3 pt-1">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{p.shops?.name ?? "Unknown shop"}</div>
              <div className="mt-1 text-xs text-muted-foreground">{p.bills?.bill_number ?? ((p as any).payment_allocations?.length ? "Allocated payment" : "Advance payment")}</div>
            </div>
            <div className={cn("shrink-0 text-right text-base font-extrabold tabular-nums", p.is_void ? "text-muted-foreground line-through" : "text-success")}>{inr(p.amount)}</div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">{modeLabel(p.mode)}</span>
            {p.is_void && <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-bold text-destructive">Voided</span>}
            {p.reference && <span className="max-w-full truncate rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">Ref: {p.reference}</span>}
          </div>
          {(p as any).payment_allocations?.length > 0 && <div className="mt-2 rounded-xl bg-muted/50 p-2.5 text-xs text-muted-foreground">Allocated to: {(p as any).payment_allocations.map((a: any) => `${a.bills?.bill_number ?? "Bill"} · ${inr(a.amount)}`).join("  /  ")}</div>}
          {(p as any).remarks && <div className="mt-2 text-xs text-muted-foreground">Remark: {(p as any).remarks}</div>}
          <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
            <span className="min-w-0 truncate capitalize">{p.employee_name} · {p.employee_role}</span>
            <span className="shrink-0">{fmtDateTime(p.paid_at)}</span>
          </div>
        </Card>
      ))}
    </div>
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
        <Card key={c.id} className="space-y-1 p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{c.payments?.shops?.name} · {c.payments?.bills?.bill_number ?? "Without Bill Payment"}</div>
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
