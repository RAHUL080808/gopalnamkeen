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
  const [sortBy, setSortBy] = useState("overdue");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { data: me } = useMe();
  const { data: shops = [] } = useQuery({
    queryKey: ["shops"],
    queryFn: async () => {
      const [{ data: s }, { data: b }] = await Promise.all([
        supabase.from("shops").select("*").order("name"),
        supabase.from("bills").select("shop_id, balance, bill_date"),
      ]);
      const today = new Date();
      const ageInDays = (date: string) => {
        const [year, month, day] = date.split("-").map(Number);
        if (!year || !month || !day) return 0;
        return Math.max(0, Math.floor((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(year, month - 1, day)) / 86400000));
      };
      return (s ?? []).map((x) => {
        const shopBills = (b ?? []).filter((y) => y.shop_id === x.id);
        const outstandingBills = shopBills.filter((y) => Number(y.balance) > 0);
        return {
          ...x,
          due: shopBills.reduce((t, y) => t + Number(y.balance), 0),
          oldestOverdueDays: outstandingBills.reduce((max, y) => Math.max(max, ageInDays(y.bill_date)), 0),
        };
      });
    },
  });
  const list = useMemo(() => {
    const term = q.trim().toLocaleLowerCase();
    const digits = term.replace(/\\D/g, "");
    const filtered = shops.filter((s) => {
      if (!term) return true;
      const searchable = [s.name, s.contact_name, s.phone, s.address]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      const phoneDigits = String(s.phone ?? "").replace(/\\D/g, "");
      return searchable.includes(term) || (digits.length >= 2 && phoneDigits.includes(digits));
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === "overdue") return b.oldestOverdueDays - a.oldestOverdueDays || b.due - a.due || a.name.localeCompare(b.name);
      if (sortBy === "amount") return b.due - a.due || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [shops, q, sortBy]);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#132443] via-[#20395f] to-[#315477] p-5 text-white shadow-xl shadow-slate-900/10 sm:p-7"><div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full border-[25px] border-white/[0.06]" /><div className="relative flex items-end justify-between gap-3"><div><div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/55">Customer directory</div><h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Shops</h1><p className="mt-1 text-xs text-white/65">Manage retailer profiles and keep track of pending balances.</p></div><Button className="shrink-0 rounded-xl bg-white text-slate-900 shadow-lg hover:bg-slate-100" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add shop</Button></div><div className="relative mt-5 flex gap-5 border-t border-white/10 pt-4"><div><div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Total shops</div><div className="mt-1 text-xl font-extrabold tabular">{shops.length}</div></div><div><div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Total outstanding</div><div className="mt-1 text-xl font-extrabold tabular text-amber-200">{inr(shops.reduce((sum, s) => sum + s.due, 0))}</div></div></div></div>
      {me?.role === "owner" && <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import Excel</Button>}
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
        <select aria-label="Sort shops" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="h-12 rounded-2xl border border-border/70 bg-card px-3 text-sm font-semibold shadow-sm outline-none focus:border-primary sm:w-52">
          <option value="overdue">Oldest overdue first</option>
          <option value="amount">Highest outstanding first</option>
          <option value="name">Shop name A–Z</option>
        </select>
      </div>
      <div className="space-y-2">
        <p className="px-1 text-xs text-muted-foreground">
          {q.trim() ? `${list.length} matching shop${list.length === 1 ? "" : "s"}` : "Shops with the oldest unpaid bills appear first."}
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
