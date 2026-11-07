import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";
import { inr, fmtDateTime, modeLabel } from "@/lib/format";
import { Card, PageTitle, Stat } from "@/components/bits";
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
    <>
      <PageTitle title="Collect payment" />
      <CollectPayment />
    </>
  );
}

function OwnerDashboard() {
  const { data } = useQuery({
    queryKey: ["owner-dashboard"],
    queryFn: async () => {
      const [bills, payments, corrections, advances] = await Promise.all([
        supabase.from("bills").select("amount, paid_amount, balance, status"),
        supabase.from("payments").select("id, amount, mode, paid_at, employee_id, employee_name, employee_role, is_void, shops(name)").eq("is_void", false).order("paid_at", { ascending: false }),
        supabase.from("payment_corrections").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("payments").select("amount, payment_allocations(amount)").is("bill_id", null).eq("is_void", false),
      ]);
      const b = bills.data ?? [];
      const p = payments.data ?? [];
      const byEmp = new Map<string, { name: string; role: string; total: number; count: number }>();
      for (const x of p) {
        const e = byEmp.get(x.employee_id) ?? { name: x.employee_name, role: x.employee_role, total: 0, count: 0 };
        e.total += Number(x.amount);
        e.count += 1;
        byEmp.set(x.employee_id, e);
      }
      return {
        sales: b.reduce((s, x) => s + Number(x.amount), 0),
        received: b.reduce((s, x) => s + Number(x.paid_amount), 0),
        outstanding: b.reduce((s, x) => s + Number(x.balance), 0),
        unpaid: b.filter((x) => x.status !== "paid").length,
        employees: [...byEmp.values()].sort((a, z) => z.total - a.total),
        recent: p.slice(0, 8),
        pendingCorrections: corrections.count ?? 0,
        unallocatedAdvance: (advances.data ?? []).reduce((sum: number, x: any) => sum + Math.max(0, Number(x.amount) - (x.payment_allocations ?? []).reduce((a: number, y: any) => a + Number(y.amount), 0)), 0),
      };
    },
  });

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-slate-800 p-5 text-primary-foreground shadow-xl shadow-primary/15 sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full border-[24px] border-white/5" />
        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">Sai Sindhu Enterprises</div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Business overview</h1>
          <p className="mt-1 text-sm text-white/70">Your collections and outstanding at a glance.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
        <Stat label="Total sales" value={inr(data?.sales)} tone="primary" />
        <Stat label="Received" value={inr(data?.received)} tone="success" />
        <Stat label="Outstanding" value={inr(data?.outstanding)} tone="danger" />
        <Stat label="Unallocated advance" value={inr(data?.unallocatedAdvance)} tone="primary" />
        <Stat label="Open bills" value={String(data?.unpaid ?? 0)} />
      </div>

      {!!data?.pendingCorrections && (
        <Link to="/payments" search={{ tab: "corrections" }} className="block rounded-xl border border-warning bg-warning/15 p-4 text-sm font-semibold text-warning-foreground">
          {data.pendingCorrections} payment correction request(s) waiting for approval →
        </Link>
      )}

      <section className="space-y-3">
        <div><h2 className="text-base font-extrabold tracking-tight">Collections by employee</h2><p className="mt-0.5 text-xs text-muted-foreground">Performance across your team</p></div>
        <Card className="divide-y">
          {data?.employees.length ? (
            data.employees.map((e) => (
              <div key={e.name + e.role} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-semibold">{e.name}</div>
                  <div className="text-xs capitalize text-muted-foreground">{e.role} · {e.count} payments</div>
                </div>
                <div className="tabular font-bold text-success">{inr(e.total)}</div>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No collections yet.</p>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-base font-extrabold tracking-tight">Recent payments</h2><p className="mt-0.5 text-xs text-muted-foreground">Latest money received</p></div>
        <Card className="divide-y">
          {data?.recent.length ? (
            data.recent.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{p.shops?.name}</div>
                  <div className="text-xs text-muted-foreground">{p.employee_name} · {modeLabel(p.mode)} · {fmtDateTime(p.paid_at)}</div>
                </div>
                <div className="tabular font-bold">{inr(p.amount)}</div>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No payments yet.</p>
          )}
        </Card>
      </section>
    </div>
  );
}
