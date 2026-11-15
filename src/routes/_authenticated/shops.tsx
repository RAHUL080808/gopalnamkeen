import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Phone, Plus, Search, Upload, X } from "lucide-react";
import { ShopImportDialog } from "@/components/shop-import-dialog";
import { useMe } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { inr } from "@/lib/format";
import { Card, Empty } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/shops")({
  head: () => ({ meta: [
    { title: "Shops — CreditBook" },
    { name: "description", content: "Manage shops, outstanding balances and owner-only Excel shop imports." },
    { property: "og:title", content: "Shops — CreditBook" },
    { property: "og:description", content: "Manage shops, outstanding balances and owner-only Excel shop imports." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ShopsPage,
});

export type ShopForm = { name: string; contact_name: string; phone: string; address: string };

function ShopsPage() {
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState(() => localStorage.getItem("shops-sort-by") || "overdue");
  const [overdueFilter, setOverdueFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { data: me } = useMe();
  const { data: shops = [] } = useQuery({
    queryKey: ["shops", me?.role],
    queryFn: async () => {
      const [{ data: s, error: shopsError }, { data: b, error: billsError }, paymentResult] = await Promise.all([
        supabase.from("shops").select("*").order("name"),
        supabase.from("bills").select("shop_id, amount, balance, bill_date, is_returned"),
        me?.role === "owner" ? supabase.from("payments").select("shop_id, bill_id, amount, paid_at, is_void, payment_allocations(amount, bill_id, bills(bill_date, is_returned)), bills(bill_date, is_returned)") : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (shopsError) throw shopsError;
      if (billsError) throw billsError;
      if (paymentResult.error) throw paymentResult.error;
      const today = new Date();
      const ageInDays = (date: string) => {
        const [year, month, day] = String(date).slice(0, 10).split("-").map(Number);
        if (!year || !month || !day) return 0;
        return Math.max(0, Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(year, month - 1, day)) / 86400000));
      };
      const paymentTotals = new Map<string, { paid: number; latePaid: number }>();
      if (me?.role === "owner") {
        for (const payment of (paymentResult.data ?? []) as any[]) {
          if (payment.is_void) continue;
          const allocations = (payment.payment_allocations ?? []).filter((x: any) => x.bills && !x.bills.is_returned);
          const entries = allocations.length ? allocations.map((x: any) => ({ amount: Number(x.amount), billDate: x.bills?.bill_date })) : payment.bill_id && payment.bills && !payment.bills.is_returned ? [{ amount: Number(payment.amount), billDate: payment.bills.bill_date }] : [];
          for (const entry of entries) {
            if (!entry.billDate || !Number.isFinite(entry.amount) || entry.amount <= 0) continue;
            const totals = paymentTotals.get(payment.shop_id) ?? { paid: 0, latePaid: 0 };
            const delayDays = Math.max(0, ageInDays(entry.billDate) - ageInDays(new Date(payment.paid_at).toLocaleDateString("en-CA")));
            totals.paid += entry.amount;
            if (delayDays > 7) totals.latePaid += entry.amount;
            paymentTotals.set(payment.shop_id, totals);
          }
        }
      }
      return (s ?? []).map((shop) => {
        const shopBills = (b ?? []).filter((x: any) => x.shop_id === shop.id && !x.is_returned);
        const outstandingBills = shopBills.filter((x: any) => Number(x.balance) > 0);
        const totalAmount = shopBills.reduce((sum: number, x: any) => sum + Math.max(0, Number(x.amount) || 0), 0);
        const due = shopBills.reduce((sum: number, x: any) => sum + (Number(x.balance) || 0), 0);
        const oldestOverdueDays = outstandingBills.reduce((max: number, x: any) => Math.max(max, ageInDays(x.bill_date)), 0);
        const history = paymentTotals.get(shop.id) ?? { paid: 0, latePaid: 0 };
        const paymentRisk = history.paid > 0 ? history.latePaid / history.paid * 60 : 0;
        const balanceRisk = totalAmount > 0 ? Math.min(1, Math.max(0, due / totalAmount)) * 20 : 0;
        const oldBillRisk = outstandingBills.length ? Math.min(1, Math.max(0, (oldestOverdueDays - 7) / 90)) * 20 : 0;
        const calculatedRisk = Math.round(paymentRisk + balanceRisk + oldBillRisk);
        // Age of the oldest unpaid bill sets the minimum risk tier:
        // 0-7 days Low, 8-29 days Risk, 30-89 days Medium, 90+ days High.
        const agingFloor = oldestOverdueDays >= 90 ? 90 : oldestOverdueDays >= 30 ? 50 : oldestOverdueDays > 7 ? 25 : 0;
        const riskScore = Math.min(100, Math.max(calculatedRisk, agingFloor));
        const riskLevel = riskScore >= 75 ? "High" : riskScore >= 50 ? "Medium" : riskScore >= 25 ? "Risk" : "Low";
        return { ...shop, due, oldestOverdueDays, riskScore, riskLevel };
      });
    },
  });
  const list = useMemo(() => {
    const term = q.trim().toLocaleLowerCase();
    const digits = term.replace(/\\D/g, "");
    const filtered = shops.filter((s) => {
      const matchesSearch = !term || (() => {
        const searchable = [s.name, s.contact_name, s.phone, s.address]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        const phoneDigits = String(s.phone ?? "").replace(/\\D/g, "");
        return searchable.includes(term) || (digits.length >= 2 && phoneDigits.includes(digits));
      })();
      const matchesOverdue = overdueFilter === "all"
        || (overdueFilter === "1m" && s.oldestOverdueDays >= 30)
        || (overdueFilter === "6m" && s.oldestOverdueDays >= 180);
      const matchesRisk = riskFilter === "all" || s.riskLevel.toLowerCase() === riskFilter;
      return matchesSearch && matchesOverdue && matchesRisk;
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === "overdue") return b.oldestOverdueDays - a.oldestOverdueDays || b.due - a.due || a.name.localeCompare(b.name);
      if (sortBy === "amount") return b.due - a.due || a.name.localeCompare(b.name);
      if (sortBy === "risk") return b.riskScore - a.riskScore || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [shops, q, sortBy, overdueFilter, riskFilter]);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#132443] via-[#20395f] to-[#315477] p-5 text-white shadow-xl shadow-slate-900/10 sm:p-7"><div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full border-[25px] border-white/[0.06]" /><div className="relative flex items-end justify-between gap-3"><div><div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/55">Customer directory</div><h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Shops</h1><p className="mt-1 text-xs text-white/65">Manage retailer profiles and keep track of pending balances.</p></div><Button className="shrink-0 rounded-xl bg-white text-slate-900 shadow-lg hover:bg-slate-100" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add shop</Button></div><div className="relative mt-5 flex gap-5 border-t border-white/10 pt-4"><div><div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Total shops</div><div className="mt-1 text-xl font-extrabold tabular">{shops.length}</div></div><div><div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Total outstanding</div><div className="mt-1 text-xl font-extrabold tabular text-amber-200">{inr(shops.reduce((sum, s) => sum + s.due, 0))}</div></div></div></div>
      {me?.role === "owner" && <div className="flex flex-wrap items-center gap-2"><div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">Customer risk · <strong>{shops.filter((s) => s.riskLevel === "High").length}</strong> high-risk shops · <strong>{shops.filter((s) => s.riskLevel === "Medium").length}</strong> medium-risk · <strong>{shops.filter((s) => s.riskLevel === "Risk").length}</strong> at-risk</div><Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import Excel</Button></div>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by shop name, mobile or contact person"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-12 rounded-2xl border-border/70 bg-card pl-10 pr-11 shadow-sm focus-visible:ring-primary/20"
          />
          {q && (
            <Button type="button" variant="ghost" size="icon" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 rounded-xl">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <select aria-label="Filter shops by overdue age" value={overdueFilter} onChange={(e) => setOverdueFilter(e.target.value)} className="h-12 rounded-2xl border border-border/70 bg-card px-3 text-sm font-semibold shadow-sm outline-none focus:border-primary sm:w-48">
          <option value="all">All shops</option>
          <option value="1m">1+ month overdue</option>
          <option value="6m">6+ months overdue</option>
        </select>
        {me?.role === "owner" && <select aria-label="Filter shops by customer risk" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="h-12 rounded-2xl border border-border/70 bg-card px-3 text-sm font-semibold shadow-sm outline-none focus:border-primary sm:w-44"><option value="all">All risk levels</option><option value="high">High risk (75+ score)</option><option value="medium">Medium risk (50–74)</option><option value="risk">At risk (25–49)</option><option value="low">Low risk (0–24)</option></select>}
        <select aria-label="Sort shops" value={sortBy} onChange={(e) => { const value = e.target.value; setSortBy(value); localStorage.setItem("shops-sort-by", value); }} className="h-12 rounded-2xl border border-border/70 bg-card px-3 text-sm font-semibold shadow-sm outline-none focus:border-primary sm:w-52">
          <option value="overdue">Oldest overdue first</option>
          <option value="amount">Highest outstanding first</option>\n          {me?.role === "owner" && <option value="risk">Highest risk score</option>}
          <option value="name">Shop name A–Z</option>
        </select>
      </div>
      <div className="space-y-2">
        <p className="px-1 text-xs text-muted-foreground">
          {`${list.length} shop${list.length === 1 ? "" : "s"} shown${overdueFilter === "1m" ? " · 1+ month overdue" : overdueFilter === "6m" ? " · 6+ months overdue" : ""}` }
        </p>
      {list.length === 0 ? <Empty>{q.trim() ? "No matching shop found. Check the name or mobile number." : "No shops yet. Add your first shop."}</Empty> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {list.map((s) => (
            <Card key={s.id} className="group overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-slate-900/[0.06]">
              <div className="flex items-center gap-3 p-3.5 sm:p-4">
                <Link to="/shops/$id" params={{ id: s.id }} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#e8f5ef] to-[#dcebe7] text-sm font-extrabold uppercase text-emerald-900 ring-1 ring-emerald-900/5">{s.name.trim().slice(0, 1) || "S"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold tracking-tight text-slate-900 transition-colors group-hover:text-emerald-800">{s.name}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{[s.contact_name, s.phone].filter(Boolean).join(" · ") || "No contact details"}</span>
                  </span>
                </Link>
                <div className="shrink-0 text-right">
                  {me?.role === "owner" && <div className={`mb-1 text-[10px] font-extrabold ${s.riskLevel === "High" ? "text-rose-700" : s.riskLevel === "Medium" ? "text-amber-700" : s.riskLevel === "Risk" ? "text-orange-700" : "text-emerald-700"}`}>{s.riskLevel} risk · {s.riskScore}/100</div>}
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Outstanding</div>
                  <div className={`mt-0.5 tabular text-sm font-extrabold ${s.due > 0 ? "text-rose-700" : "text-emerald-700"}`}>{inr(s.due)}</div>
                  {s.oldestOverdueDays > 0 && <div className="mt-1 text-[10px] font-bold text-rose-700">{s.oldestOverdueDays} days since oldest unpaid bill</div>}
                  {s.phone && <a href={`tel:${String(s.phone).replace(/[^\\d+]/g, "")}`} aria-label={`Call ${s.name}`} title="Call shop" className="mt-1 inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-bold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"><Phone className="h-3 w-3" /> Call</a>}
                </div>
              </div>
              <div className={`h-1 w-full ${s.due > 0 ? "bg-gradient-to-r from-rose-300 to-rose-100" : "bg-gradient-to-r from-emerald-300 to-emerald-100"}`} />
            </Card>
          ))}
        </div>
      )}
      </div>
      <ShopDialog open={open} onOpenChange={setOpen} driverMode={me?.role === "driver"} />
      {me?.role === "owner" && <ShopImportDialog open={importOpen} onOpenChange={setImportOpen} />}
    </div>
  );
}

export function ShopDialog({ open, onOpenChange, shop, driverMode = false }: { open: boolean; onOpenChange: (o: boolean) => void; shop?: ShopForm & { id: string }; driverMode?: boolean }) {
  const qc = useQueryClient();
  const [f, setF] = useState<ShopForm>({ name: shop?.name ?? "", contact_name: shop?.contact_name ?? "", phone: shop?.phone ?? "", address: shop?.address ?? "" });
  const m = useMutation({
    mutationFn: async () => {
      const row = { name: f.name.trim(), contact_name: f.contact_name.trim() || null, phone: f.phone.trim() || null, address: f.address.trim() || null };
      if (!row.name) throw new Error("Shop name is required");
      if (driverMode) {
        const { error } = shop
          ? await (supabase.rpc as any)("driver_update_shop_contact", {
              _shop_id: shop.id,
              _name: row.name,
              _contact_name: row.contact_name,
              _phone: row.phone,
              _address: row.address,
            })
          : await (supabase.rpc as any)("driver_create_shop", {
              _name: row.name,
              _contact_name: row.contact_name,
              _phone: row.phone,
              _address: row.address,
            });
        if (error) throw error;
      } else {
        const { error } = shop ? await supabase.from("shops").update(row).eq("id", shop.id) : await supabase.from("shops").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(shop ? "Shop updated" : "Shop added");
      qc.invalidateQueries();
      if (!shop) setF({ name: "", contact_name: "", phone: "", address: "" });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const set = (k: keyof ShopForm) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{driverMode ? shop ? "Update shop contact details" : "Add new shop" : shop ? "Edit shop" : "Add shop"}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="space-y-1.5"><Label>Shop name</Label><Input required maxLength={120} value={f.name} onChange={set("name")} />{driverMode && shop && <p className="text-xs text-muted-foreground">Update the shop name only if it is incorrect.</p>}</div>
          <div className="space-y-1.5"><Label>Contact person</Label><Input maxLength={80} value={f.contact_name} onChange={set("contact_name")} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input type="tel" maxLength={20} value={f.phone} onChange={set("phone")} /></div>
          <div className="space-y-1.5"><Label>Address / area</Label><Input maxLength={200} value={f.address} onChange={set("address")} /></div>
          <Button type="submit" className="w-full" disabled={m.isPending}>{m.isPending ? "Saving…" : driverMode ? shop ? "Save contact details" : "Add shop" : "Save"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
