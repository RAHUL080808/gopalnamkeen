import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Upload, X } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { data: me } = useMe();
  const { data: shops = [] } = useQuery({
    queryKey: ["shops"],
    queryFn: async () => {
      const [{ data: s }, { data: b }] = await Promise.all([
        supabase.from("shops").select("*").order("name"),
        supabase.from("bills").select("shop_id, balance"),
      ]);
      return (s ?? []).map((x) => ({ ...x, due: (b ?? []).filter((y) => y.shop_id === x.id).reduce((t, y) => t + Number(y.balance), 0) }));
    },
  });
  const list = useMemo(() => {
    const term = q.trim().toLocaleLowerCase();
    if (!term) return shops;
    const digits = term.replace(/\\D/g, "");
    return shops.filter((s) => {
      const searchable = [s.name, s.contact_name, s.phone, s.address]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      const phoneDigits = String(s.phone ?? "").replace(/\\D/g, "");
      return searchable.includes(term) || (digits.length >= 2 && phoneDigits.includes(digits));
    });
  }, [shops, q]);

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#132443] via-[#20395f] to-[#315477] p-5 text-white shadow-xl shadow-slate-900/10 sm:p-7"><div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full border-[25px] border-white/[0.06]" /><div className="relative flex items-end justify-between gap-3"><div><div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/55">Customer directory</div><h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Shops</h1><p className="mt-1 text-xs text-white/65">Manage retailer profiles and keep track of pending balances.</p></div><Button className="shrink-0 rounded-xl bg-white text-slate-900 shadow-lg hover:bg-slate-100" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add shop</Button></div><div className="relative mt-5 flex gap-5 border-t border-white/10 pt-4"><div><div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Total shops</div><div className="mt-1 text-xl font-extrabold tabular">{shops.length}</div></div><div><div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Total outstanding</div><div className="mt-1 text-xl font-extrabold tabular text-amber-200">{inr(shops.reduce((sum, s) => sum + s.due, 0))}</div></div></div></div>
      {me?.role === "owner" && <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import Excel</Button>}
      <div className="space-y-2">
        <div className="relative">
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
        <p className="px-1 text-xs text-muted-foreground">
          {q.trim() ? `${list.length} matching shop${list.length === 1 ? "" : "s"}` : "Search using shop name, mobile number, contact person or area."}
        </p>
      </div>
      {list.length === 0 ? <Empty>{q.trim() ? "No matching shop found. Check the name or mobile number." : "No shops yet. Add your first shop."}</Empty> : (
        <Card className="divide-y divide-border/60 overflow-hidden">
          {list.map((s) => (
            <Link key={s.id} to="/shops/$id" params={{ id: s.id }} className="group flex items-center justify-between gap-3 p-4 transition-all hover:bg-primary/[0.035]">
              <div className="min-w-0">
                <div className="truncate font-extrabold tracking-tight transition-colors group-hover:text-primary">{s.name}</div>
                <div className="truncate text-xs text-muted-foreground">{[s.contact_name, s.phone].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <div className="shrink-0 text-right"><div className={`tabular font-bold ${s.due > 0 ? "text-destructive" : "text-success"}`}>{inr(s.due)}</div></div>
            </Link>
          ))}
        </Card>
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
