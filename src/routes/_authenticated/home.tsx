import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ElementType, ReactNode } from "react";
import {
  ArrowDownToLine, ArrowUpRight, Banknote, CalendarDays, CheckCircle2,
  Clock3, FileText, Plus, ReceiptText, Store, TrendingUp, Users, WalletCards,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";
import { inr, fmtDateTime, modeLabel } from "@/lib/format";
import { Card } from "@/components/bits";
import { CollectPayment } from "@/components/collect-payment";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => pageMeta("Dashboard — CreditBook", "Track FMCG sales, received payments, outstanding credit and employee collections."),
  component: HomePage,
});

function HomePage() {
  const { data: me } = useMe();
  if (me?.role === "owner") return <OwnerDashboard />;
  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-gradient-to-br from-primary via-primary to-slate-800 p-5 text-primary-foreground shadow-xl shadow-primary/15 sm:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Sai Sindhu Enterprises</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Collect payment</h1>
        <p className="mt-1 text-sm text-white/70">Find a shop and record the payment received.</p>
      </div>
      <CollectPayment />
    </div>
  );
}

function MetricCard({ label, value, caption, icon: Icon, tone = "navy" }: {
  label: string; value: string; caption: string; icon: ElementType;
  tone?: "navy" | "green" | "red" | "amber";
}) {
  const tones = {
    navy: "bg-primary/10 text-primary",
    green: "bg-emerald-500/10 text-emerald-600",
    red: "bg-rose-500/10 text-rose-600",
    amber: "bg-amber-500/10 text-amber-700",
  };
  return (
    <div className="group min-w-0 rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/[0.06] sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground sm:text-sm">{label}</span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="mt-3 break-words text-xl font-extrabold tracking-tight tabular sm:text-2xl">{value}</div>
      <p className="mt-1 text-[11px] font-medium text-muted-foreground sm:text-xs">{caption}</p>
    </div>
  );
}

function SectionHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div><h2 className="text-base font-extrabold tracking-tight sm:text-lg">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p></div>
      {action}
    </div>
  );
}

function OwnerDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["owner-dashboard"],
    queryFn: async () => {
      const [bills, payments, corrections, advances] = await Promise.all([
        supabase.from("bills").select("id, amount, paid_amount, balance, status"),
        supabase.from("payments").select("id, amount, mode, paid_at, employee_id, employee_name, employee_role, is_void, shops(name)").eq("is_void", false).order("paid_at", { ascending: false }),
        supabase.from("payment_corrections").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("payments").select("amount, payment_allocations(amount)").is("bill_id", null).eq("is_void", false),
      ]);
      const b = bills.data ?? [];
      const p = payments.data ?? [];
      const byEmp = new Map<string, { name: string; role: string; total: number; count: number }>();
      for (const x of p) {
        const key = x.employee_id ?? x.employee_name ?? "unknown";
        const e = byEmp.get(key) ?? { name: x.employee_name ?? "Team member", role: x.employee_role ?? "staff", total: 0, count: 0 };
        e.total += Number(x.amount);
        e.count += 1;
        byEmp.set(key, e);
      }
      const sales = b.reduce((s, x) => s + Number(x.amount), 0);
      const received = b.reduce((s, x) => s + Number(x.paid_amount), 0);
      return {
        sales, received,
        outstanding: b.reduce((s, x) => s + Number(x.balance), 0),
        unpaid: b.filter((x) => x.status !== "paid").length,
        paidBills: b.filter((x) => x.status === "paid").length,
        partialBills: b.filter((x) => x.status === "partial").length,
        totalBills: b.length,
        employees: [...byEmp.values()].sort((a, z) => z.total - a.total),
        recent: p.slice(0, 7),
        pendingCorrections: corrections.count ?? 0,
        unallocatedAdvance: (advances.data ?? []).reduce((sum: number, x: any) => sum + Math.max(0, Number(x.amount) - (x.payment_allocations ?? []).reduce((a: number, y: any) => a + Number(y.amount), 0)), 0),
      };
    },
  });
  const rate = data && data.sales > 0 ? Math.min(100, Math.round((data.received / data.sales) * 100)) : 0;

  return (
    <div className="space-y-6 pb-3 sm:space-y-7">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-gradient-to-br from-[#101d3b] via-[#172b50] to-[#243c60] p-5 text-white shadow-xl shadow-slate-900/15 sm:p-7 lg:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[36px] border-white/[0.045]" />
        <div className="pointer-events-none absolute -bottom-28 right-24 h-64 w-64 rounded-full bg-cyan-300/[0.07] blur-2xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/75"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Sai Sindhu Enterprises</div>
            <h1 className="mt-4 text-[27px] font-extrabold leading-tight tracking-tight sm:text-4xl">Business overview</h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/65">A clear view of your sales, collections and pending payments — all in one place.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/bills" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100"><Plus className="h-4 w-4" /> View bills</Link>
            <Link to="/shops" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/15"><Store className="h-4 w-4" /> Shops</Link>
          </div>
        </div>
        <div className="relative mt-7 grid grid-cols-3 gap-2 border-t border-white/10 pt-5 sm:max-w-xl sm:gap-5">
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Total bills</p><p className="mt-1 text-xl font-extrabold tabular sm:text-2xl">{isLoading ? "—" : data?.totalBills ?? 0}</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Fully paid</p><p className="mt-1 text-xl font-extrabold tabular text-emerald-300 sm:text-2xl">{isLoading ? "—" : data?.paidBills ?? 0}</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Part-paid</p><p className="mt-1 text-xl font-extrabold tabular text-amber-200 sm:text-2xl">{isLoading ? "—" : data?.partialBills ?? 0}</p></div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard label="Total sales" value={isLoading ? "—" : inr(data?.sales ?? 0)} caption="Value of all recorded bills" icon={ReceiptText} />
        <MetricCard label="Amount received" value={isLoading ? "—" : inr(data?.received ?? 0)} caption="Payments adjusted against bills" icon={ArrowDownToLine} tone="green" />
        <MetricCard label="Outstanding" value={isLoading ? "—" : inr(data?.outstanding ?? 0)} caption={`${data?.unpaid ?? 0} bills still open`} icon={WalletCards} tone="red" />
        <MetricCard label="Unallocated advance" value={isLoading ? "—" : inr(data?.unallocatedAdvance ?? 0)} caption="Advance received, not yet adjusted" icon={Banknote} tone="amber" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Collection progress</p><h2 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">{isLoading ? "—" : `${rate}%`} <span className="text-sm font-semibold text-muted-foreground">of billed sales received</span></h2></div>
            <span className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600"><TrendingUp className="h-5 w-5" /></span>
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700" style={{ width: `${isLoading ? 0 : rate}%` }} /></div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-emerald-600">Received: {isLoading ? "—" : inr(data?.received ?? 0)}</span><span className="font-semibold text-muted-foreground">Sales: {isLoading ? "—" : inr(data?.sales ?? 0)}</span></div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border/70 pt-4">
            <div><p className="text-[11px] text-muted-foreground">Open bills</p><p className="mt-1 text-lg font-extrabold tabular">{isLoading ? "—" : data?.unpaid ?? 0}</p></div>
            <div><p className="text-[11px] text-muted-foreground">Pending approvals</p><p className="mt-1 text-lg font-extrabold tabular">{isLoading ? "—" : data?.pendingCorrections ?? 0}</p></div>
          </div>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Quick access</p><h2 className="mt-1 text-lg font-extrabold tracking-tight">Manage your business</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link to="/shops" className="group flex min-h-[86px] flex-col justify-between rounded-2xl border border-border/70 bg-muted/35 p-3 transition hover:border-primary/30 hover:bg-primary/[0.04]"><Store className="h-5 w-5 text-primary" /><span className="flex items-center justify-between text-xs font-bold">Shops <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span></Link>
            <Link to="/bills" className="group flex min-h-[86px] flex-col justify-between rounded-2xl border border-border/70 bg-muted/35 p-3 transition hover:border-primary/30 hover:bg-primary/[0.04]"><FileText className="h-5 w-5 text-primary" /><span className="flex items-center justify-between text-xs font-bold">Bills <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span></Link>
            <Link to="/payments" className="group flex min-h-[86px] flex-col justify-between rounded-2xl border border-border/70 bg-muted/35 p-3 transition hover:border-primary/30 hover:bg-primary/[0.04]"><WalletCards className="h-5 w-5 text-primary" /><span className="flex items-center justify-between text-xs font-bold">Payments <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span></Link>
            <Link to="/team" className="group flex min-h-[86px] flex-col justify-between rounded-2xl border border-border/70 bg-muted/35 p-3 transition hover:border-primary/30 hover:bg-primary/[0.04]"><Users className="h-5 w-5 text-primary" /><span className="flex items-center justify-between text-xs font-bold">Team <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span></Link>
          </div>
        </Card>
      </section>

      {!!data?.pendingCorrections && <Link to="/payments" search={{ tab: "corrections" }} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300/70 bg-amber-50 p-4 text-sm font-bold text-amber-900 transition hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200"><span className="flex items-center gap-3"><Clock3 className="h-5 w-5 shrink-0" /> {data.pendingCorrections} payment correction request(s) need your review</span><ArrowUpRight className="h-4 w-4 shrink-0" /></Link>}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3"><div><h2 className="text-base font-extrabold tracking-tight sm:text-lg">Collections by employee</h2><p className="mt-0.5 text-xs text-muted-foreground">Team collection totals from recorded payments</p></div><Link to="/team" className="text-xs font-bold text-primary hover:underline">View team →</Link></div>
        <Card className="overflow-hidden divide-y divide-border/70">
          {isLoading ? <p className="p-5 text-sm text-muted-foreground">Loading collections…</p> : data?.employees.length ? data.employees.map((e) => (
            <div key={e.name + e.role} className="flex items-center justify-between gap-3 p-4 transition hover:bg-muted/30">
              <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary">{e.name.trim().slice(0, 1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-sm font-bold">{e.name}</div><div className="mt-0.5 text-xs capitalize text-muted-foreground">{e.role} · {e.count} payments</div></div></div>
              <div className="shrink-0 text-right"><div className="text-sm font-extrabold tabular text-emerald-600">{inr(e.total)}</div><div className="text-[10px] text-muted-foreground">collected</div></div>
            </div>
          )) : <p className="p-5 text-sm text-muted-foreground">No collections recorded yet.</p>}
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3"><div><h2 className="text-base font-extrabold tracking-tight sm:text-lg">Recent payments</h2><p className="mt-0.5 text-xs text-muted-foreground">Latest payment entries across all shops</p></div><Link to="/payments" className="text-xs font-bold text-primary hover:underline">All payments →</Link></div>
        <Card className="overflow-hidden divide-y divide-border/70">
          {isLoading ? <p className="p-5 text-sm text-muted-foreground">Loading recent payments…</p> : data?.recent.length ? data.recent.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 p-4 transition hover:bg-muted/30">
              <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div><div className="min-w-0"><div className="truncate text-sm font-bold">{p.shops?.name ?? "Shop"}</div><div className="mt-0.5 truncate text-[11px] text-muted-foreground">{p.employee_name} · {modeLabel(p.mode)} · {fmtDateTime(p.paid_at)}</div></div></div>
              <div className="shrink-0 text-sm font-extrabold tabular">{inr(p.amount)}</div>
            </div>
          )) : <p className="p-5 text-sm text-muted-foreground">No payments recorded yet.</p>}
        </Card>
      </section>
      <p className="flex items-center justify-center gap-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70"><CalendarDays className="h-3.5 w-3.5" /> Business performance at a glance</p>
    </div>
  );
}
