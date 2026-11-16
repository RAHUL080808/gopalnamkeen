import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ElementType, ReactNode } from "react";
import { useState } from "react";
import {
  ArrowDownToLine, ArrowUpRight, HandCoins, Banknote, CalendarDays, CheckCircle2, Plus,
  Clock3, FileText, ReceiptText, Store, TrendingUp, Users, WalletCards, ChevronLeft, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";
import { inr, fmtDateTime, modeLabel } from "@/lib/format";
import { Card, Empty } from "@/components/bits";
import { CollectPayment } from "@/components/collect-payment";
import { pageMeta } from "@/lib/page-meta";
import { BillEntryDialog } from "@/components/bill-entry-dialog";
import { OrderScheduler } from "@/components/order-scheduler";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => pageMeta("Dashboard — CreditBook", "Track FMCG sales, received payments, outstanding credit and employee collections."),
  component: HomePage,
});

function HomePage() {
  const { data: me } = useMe();
  if (me?.role === "owner") return <OwnerDashboard />;
  if (me?.role === "driver") return <StaffDashboard employeeId={me.id} />;
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

function StaffDashboard({ employeeId }: { employeeId: string }) {
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [showCollectPayment, setShowCollectPayment] = useState(false);
  const today = new Date().toLocaleDateString("en-CA");
  const todayLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const dayStart = new Date(`${today}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const { data: collectionPayments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["driver-today-collections", employeeId, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("amount, mode, paid_at")
        .eq("employee_id", employeeId)
        .eq("is_void", false)
        .gte("paid_at", dayStart.toISOString())
        .lt("paid_at", dayEnd.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });
  const collectionTotal = collectionPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["staff-todays-orders", today],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_order_bills")
        .select("bill_id, bills!inner(id, bill_number, bill_date, amount, balance, shop_id, shops!inner(id, name))")
        .eq("visit_date", today)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const grouped = new Map<string, { id: string; name: string; bills: any[]; total: number; due: number }>();
      for (const entry of data ?? []) {
        const bill = (entry as any).bills;
        const shop = bill?.shops as unknown as { id: string; name: string } | null;
        if (!shop) continue;
        const item = grouped.get(shop.id) ?? { id: shop.id, name: shop.name, bills: [], total: 0, due: 0 };
        item.bills.push(bill);
        item.total += Number(bill.amount);
        item.due += Number(bill.balance);
        grouped.set(shop.id, item);
      }
      return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const selectedShop = orders.find((shop) => shop.id === selectedShopId);
  const totalBills = orders.reduce((sum, shop) => sum + shop.bills.length, 0);

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-4">
      <section className="rounded-[24px] border border-emerald-950/10 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-800">
              <CalendarDays className="h-3.5 w-3.5" />
              {todayLabel}
            </p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">Namaste! 👋</h1>
            <p className="mt-1 text-sm text-slate-500">Aaj ka kaam yahan se manage karein.</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800">
            <Store className="h-5 w-5" />
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 divide-x divide-slate-200 rounded-2xl bg-slate-50 px-3 py-3">
          <div className="pr-3">
            <p className="text-[11px] font-semibold text-slate-500">Aaj ke orders</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 tabular">{ordersLoading ? "—" : totalBills}</p>
            <p className="text-[10px] text-slate-500">{ordersLoading ? "Loading…" : `${orders.length} shops`}</p>
          </div>
          <div className="pl-3">
            <p className="text-[11px] font-semibold text-slate-500">Aaj ki collection</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight text-emerald-800 tabular">{paymentsLoading ? "—" : inr(collectionTotal)}</p>
            <p className="text-[10px] text-slate-500">{paymentsLoading ? "Loading…" : `${collectionPayments.length} payments`}</p>
          </div>
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className="px-0.5 text-sm font-extrabold tracking-tight text-slate-900">Quick actions</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => setBillDialogOpen(true)}
            className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-2xl border border-emerald-800/10 bg-emerald-800 px-2 py-3 text-center text-white shadow-sm transition active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15"><Plus className="h-6 w-6" /></span>
            <span className="text-xs font-extrabold">Naya Bill</span>
          </button>
          <button
            type="button"
            onClick={() => { setSelectedShopId(null); setShowCollectPayment((value) => !value); }}
            aria-expanded={showCollectPayment}
            className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center text-slate-800 shadow-sm transition active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><HandCoins className="h-6 w-6" /></span>
            <span className="text-xs font-extrabold">Payment Lo</span>
          </button>
          <Link
            to="/shops"
            className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-3 text-center text-slate-800 shadow-sm transition active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Store className="h-6 w-6" /></span>
            <span className="text-xs font-extrabold">Shop Search</span>
          </Link>
        </div>
      </section>

      {showCollectPayment && (
        <section className="space-y-3 rounded-2xl border border-blue-100 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Payment collect karein</h2>
              <p className="mt-0.5 text-xs text-slate-500">Shop search karke pending bill select karein.</p>
            </div>
            <button type="button" onClick={() => setShowCollectPayment(false)} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500">Close</button>
          </div>
          <CollectPayment />
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-slate-900">Aaj ke Orders</h2>
            <p className="mt-0.5 text-xs text-slate-500">Aaj ke liye assigned shop orders</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{ordersLoading ? "…" : `${orders.length} shops`}</span>
        </div>

        {ordersLoading ? (
          <Card className="p-5 text-sm text-muted-foreground">Aaj ke orders load ho rahe hain…</Card>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-7 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><FileText className="h-5 w-5" /></span>
            <p className="mt-3 text-sm font-bold text-slate-800">Aaj koi order nahi hai</p>
            <p className="mt-1 text-xs text-slate-500">Owner ke assign kiye hue orders yahan dikhai denge.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {orders.map((shop) => (
              <button
                key={shop.id}
                type="button"
                onClick={() => { setSelectedShopId(shop.id); setShowCollectPayment(false); }}
                className="w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:border-emerald-200 active:scale-[0.995]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><Store className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-slate-900">{shop.name}</span>
                    <span className="mt-1 block text-xs text-slate-500">{shop.bills.length} bill{shop.bills.length === 1 ? "" : "s"} · Total {inr(shop.total)}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                  <span className="text-[11px] font-semibold text-slate-500">Outstanding</span>
                  <span className={`text-sm font-extrabold tabular ${shop.due > 0 ? "text-rose-700" : "text-emerald-700"}`}>{inr(shop.due)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedShopId && (
        <section className="scroll-mt-24 space-y-3 rounded-2xl border border-emerald-100 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Selected shop</p>
              <h2 className="mt-1 truncate text-base font-extrabold text-slate-900">{selectedShop?.name ?? "Shop details"}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link to="/shops/$id" params={{ id: selectedShopId }} className="rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-bold text-slate-700">Shop details</Link>
              <button type="button" onClick={() => setSelectedShopId(null)} aria-label="Close selected shop" className="rounded-lg p-2 text-slate-500"><ChevronLeft className="h-4 w-4" /></button>
            </div>
          </div>
          <CollectPayment key={selectedShopId} initialShopId={selectedShopId} />
        </section>
      )}

      <BillEntryDialog open={billDialogOpen} onOpenChange={setBillDialogOpen} driverMode />
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
  const [billDialogOpen, setBillDialogOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [collectionDay, setCollectionDay] = useState<"today" | "yesterday">("today");
  const { data, isLoading } = useQuery({
    queryKey: ["owner-dashboard"],
    queryFn: async () => {
      const [bills, payments, corrections, advances] = await Promise.all([
        supabase.from("bills").select("id, amount, paid_amount, balance, status, bill_date, bill_number, shop_id, is_returned, shops(name)"),
        supabase.from("payments").select("id, amount, mode, paid_at, employee_id, employee_name, employee_role, is_void, shops(name)").eq("is_void", false).order("paid_at", { ascending: false }),
        supabase.from("payment_corrections").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("payments").select("amount, payment_allocations(amount)").is("bill_id", null).eq("is_void", false),
      ]);
      const b = bills.data ?? [];
      const p = payments.data ?? [];
      const today = new Date().toLocaleDateString("en-CA");
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = yesterdayDate.toLocaleDateString("en-CA");
      const todaysPayments = p.filter((x) => new Date(x.paid_at).toLocaleDateString("en-CA") === today);
      const yesterdaysPayments = p.filter((x) => new Date(x.paid_at).toLocaleDateString("en-CA") === yesterday);
      const groupByEmployee = (rows: typeof p) => {
        const byEmployee = new Map<string, { id: string; name: string; role: string; total: number; count: number; cash: number; upi: number; bank: number; cheque: number }>();
        for (const x of rows) {
          const key = x.employee_id ?? x.employee_name ?? "unknown";
          const e = byEmployee.get(key) ?? { id: key, name: x.employee_name ?? "Team member", role: x.employee_role ?? "staff", total: 0, count: 0, cash: 0, upi: 0, bank: 0, cheque: 0 };
          const amount = Number(x.amount);
          e.total += amount; e.count += 1;
          if (x.mode === "cash") e.cash += amount;
          else if (x.mode === "upi") e.upi += amount;
          else if (x.mode === "bank_transfer") e.bank += amount;
          else if (x.mode === "cheque") e.cheque += amount;
          byEmployee.set(key, e);
        }
        return [...byEmployee.values()].sort((a, z) => z.total - a.total);
      };
      const dailyEmployees = groupByEmployee(todaysPayments);
      const yesterdayEmployees = groupByEmployee(yesterdaysPayments);
      const dailyCash = todaysPayments.filter((x) => x.mode === "cash").reduce((s, x) => s + Number(x.amount), 0);
      const dailyUpi = todaysPayments.filter((x) => x.mode === "upi").reduce((s, x) => s + Number(x.amount), 0);
      const dailyBank = todaysPayments.filter((x) => x.mode === "bank_transfer").reduce((s, x) => s + Number(x.amount), 0);
      const dailyCheque = todaysPayments.filter((x) => x.mode === "cheque").reduce((s, x) => s + Number(x.amount), 0);
      const yesterdayCash = yesterdaysPayments.filter((x) => x.mode === "cash").reduce((s, x) => s + Number(x.amount), 0);
      const yesterdayUpi = yesterdaysPayments.filter((x) => x.mode === "upi").reduce((s, x) => s + Number(x.amount), 0);
      const yesterdayBank = yesterdaysPayments.filter((x) => x.mode === "bank_transfer").reduce((s, x) => s + Number(x.amount), 0);
      const yesterdayCheque = yesterdaysPayments.filter((x) => x.mode === "cheque").reduce((s, x) => s + Number(x.amount), 0);
      const activeBills = b.filter((x: any) => !x.is_returned);
      const sales = activeBills.reduce((s, x) => s + Number(x.amount), 0);
      const now = new Date();
      const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      const overdueBills = activeBills
        .filter((x: any) => Number(x.balance) > 0)
        .map((x: any) => {
          const [y, m, d] = String(x.bill_date).split("-").map(Number);
          if (y === undefined || m === undefined || d === undefined) return { ...x, age: NaN };
          const age = Math.floor((todayUtc - Date.UTC(y, m - 1, d)) / 86400000);
          return { ...x, age };
        })
        .filter((x: any) => x.age >= 7)
        .sort((a: any, z: any) => z.age - a.age);
      const received = activeBills.reduce((s, x) => s + Number(x.paid_amount), 0);

      return {
        sales, received,
        overdueBills,
        overdue7: overdueBills.length,
        overdue15: overdueBills.filter((x: any) => x.age >= 15).length,
        overdue30: overdueBills.filter((x: any) => x.age >= 30).length,
        overdueAmount: overdueBills.reduce((sum: number, x: any) => sum + Number(x.balance), 0),
        outstanding: activeBills.reduce((s, x) => s + Number(x.balance), 0),
        unpaid: activeBills.filter((x) => x.status !== "paid").length,
        paidBills: activeBills.filter((x) => x.status === "paid").length,
        partialBills: activeBills.filter((x) => x.status === "partial").length,
        totalBills: activeBills.length,
        dailyEmployees, yesterdayEmployees,
        dailyCash, dailyUpi, dailyBank, dailyCheque,
        dailyTotal: dailyCash + dailyUpi + dailyBank + dailyCheque,
        yesterdayCash, yesterdayUpi, yesterdayBank, yesterdayCheque,
        yesterdayTotal: yesterdayCash + yesterdayUpi + yesterdayBank + yesterdayCheque,
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
            <button onClick={() => setBillDialogOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100"><Plus className="h-4 w-4" /> Add bill</button>
            <Link to="/bills" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/15"><FileText className="h-4 w-4" /> View bills</Link>
            <Link to="/shops" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/15"><Store className="h-4 w-4" /> Shops</Link>
          </div>
        </div>
        <div className="relative mt-7 grid grid-cols-3 gap-2 border-t border-white/10 pt-5 sm:max-w-xl sm:gap-5">
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Total bills</p><p className="mt-1 text-xl font-extrabold tabular sm:text-2xl">{isLoading ? "—" : data?.totalBills ?? 0}</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Fully paid</p><p className="mt-1 text-xl font-extrabold tabular text-emerald-300 sm:text-2xl">{isLoading ? "—" : data?.paidBills ?? 0}</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Part-paid</p><p className="mt-1 text-xl font-extrabold tabular text-amber-200 sm:text-2xl">{isLoading ? "—" : data?.partialBills ?? 0}</p></div>
        </div>
      </section>

      <OrderScheduler />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-base font-extrabold tracking-tight sm:text-lg">Employee collections</h2><p className="mt-0.5 text-xs text-muted-foreground">Only today’s and yesterday’s collection is shown</p></div>
          <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
            <button onClick={() => { setCollectionDay("today"); setSelectedEmployeeId(null); }} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${collectionDay === "today" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Today</button>
            <button onClick={() => { setCollectionDay("yesterday"); setSelectedEmployeeId(null); }} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${collectionDay === "yesterday" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Yesterday</button>
          </div>
        </div>
        <Card className="p-4 sm:p-5">
          <div className="text-xs font-semibold text-muted-foreground">Total collection · {collectionDay === "today" ? "Today" : "Yesterday"}</div>
          <div className="mt-1 text-2xl font-extrabold tracking-tight tabular">{isLoading ? "—" : inr(collectionDay === "today" ? data?.dailyTotal ?? 0 : data?.yesterdayTotal ?? 0)}</div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-emerald-500/10 p-3"><div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Cash</div><div className="mt-1 text-lg font-extrabold tabular">{isLoading ? "—" : inr(collectionDay === "today" ? data?.dailyCash ?? 0 : data?.yesterdayCash ?? 0)}</div></div>
            <div className="rounded-xl bg-sky-500/10 p-3"><div className="text-xs font-semibold text-sky-700 dark:text-sky-400">UPI</div><div className="mt-1 text-lg font-extrabold tabular">{isLoading ? "—" : inr(collectionDay === "today" ? data?.dailyUpi ?? 0 : data?.yesterdayUpi ?? 0)}</div></div>
            <div className="rounded-xl bg-blue-500/10 p-3"><div className="text-xs font-semibold text-blue-700 dark:text-blue-400">Bank transfer</div><div className="mt-1 text-lg font-extrabold tabular">{isLoading ? "—" : inr(collectionDay === "today" ? data?.dailyBank ?? 0 : data?.yesterdayBank ?? 0)}</div></div>
            <div className="rounded-xl bg-amber-500/10 p-3"><div className="text-xs font-semibold text-amber-700 dark:text-amber-400">Cheque</div><div className="mt-1 text-lg font-extrabold tabular">{isLoading ? "—" : inr(collectionDay === "today" ? data?.dailyCheque ?? 0 : data?.yesterdayCheque ?? 0)}</div></div>
          </div>
        </Card>
        <div className="flex items-end justify-between gap-3"><div><h3 className="text-sm font-extrabold">Member-wise collection</h3><p className="mt-0.5 text-xs text-muted-foreground">Tap a member to see payment-mode details</p></div><span className="text-xs text-muted-foreground">{(collectionDay === "today" ? data?.dailyEmployees : data?.yesterdayEmployees)?.length ?? 0} members</span></div>
        <Card className="overflow-hidden divide-y divide-border/70">
          {isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading collections…</p> : (collectionDay === "today" ? data?.dailyEmployees : data?.yesterdayEmployees)?.length ? (collectionDay === "today" ? data?.dailyEmployees : data?.yesterdayEmployees)?.map((e) => (
            <div key={e.id}>
              <button onClick={() => setSelectedEmployeeId(selectedEmployeeId === e.id ? null : e.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-muted/30">
                <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-extrabold text-primary">{e.name.trim().slice(0, 1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-sm font-bold">{e.name}</div><div className="mt-0.5 text-xs capitalize text-muted-foreground">{e.role} · {e.count} payments</div></div></div>
                <div className="flex shrink-0 items-center gap-2"><span className="text-sm font-extrabold tabular text-emerald-600">{inr(e.total)}</span><ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selectedEmployeeId === e.id ? "rotate-90" : ""}`} /></div>
              </button>
              {selectedEmployeeId === e.id && <div className="grid grid-cols-2 gap-2 bg-muted/25 px-4 pb-4 sm:grid-cols-4">
                <div className="rounded-lg bg-card p-3"><div className="text-[11px] text-muted-foreground">Cash</div><div className="mt-1 text-sm font-extrabold tabular">{inr(e.cash)}</div></div>
                <div className="rounded-lg bg-card p-3"><div className="text-[11px] text-muted-foreground">UPI</div><div className="mt-1 text-sm font-extrabold tabular">{inr(e.upi)}</div></div>
                <div className="rounded-lg bg-card p-3"><div className="text-[11px] text-muted-foreground">Bank transfer</div><div className="mt-1 text-sm font-extrabold tabular">{inr(e.bank)}</div></div>
                <div className="rounded-lg bg-card p-3"><div className="text-[11px] text-muted-foreground">Cheque</div><div className="mt-1 text-sm font-extrabold tabular">{inr(e.cheque)}</div></div>
              </div>}
            </div>
          )) : <p className="p-4 text-sm text-muted-foreground">No collections recorded for this day.</p>}
        </Card>
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
      <BillEntryDialog open={billDialogOpen} onOpenChange={setBillDialogOpen} />
    </div>
  );
}
