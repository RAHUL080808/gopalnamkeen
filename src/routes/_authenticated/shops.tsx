import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Upload } from "lucide-react";
import { ShopImportDialog } from "@/components/shop-import-dialog";
import { useMe } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { inr } from "@/lib/format";
import { Card, Empty, PageTitle } from "@/components/bits";
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
  const list = useMemo(() => shops.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())), [shops, q]);

  return (
    <div className="space-y-3">
      <PageTitle title="Shops" action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add shop</Button>} />
      {me?.role === "owner" && <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import Excel</Button>}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search shop" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-9" />
      </div>
      {list.length === 0 ? <Empty>No shops yet. Add your first shop.</Empty> : (
        <Card className="divide-y">
          {list.map((s) => (
            <Link key={s.id} to="/shops/$id" params={{ id: s.id }} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="truncate font-semibold">{s.name}</div>
                <div className="truncate text-xs text-muted-foreground">{[s.contact_name, s.phone].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <div className="shrink-0 text-right"><div className={`tabular font-bold ${s.due > 0 ? "text-destructive" : "text-success"}`}>{inr(s.due)}</div>{s.advance > 0 && <div className="text-[11px] font-medium text-primary">Advance {inr(s.advance)}</div>}</div>
            </Link>
          ))}
        </Card>
      )}
      <ShopDialog open={open} onOpenChange={setOpen} />
      {me?.role === "owner" && <ShopImportDialog open={importOpen} onOpenChange={setImportOpen} />}
    </div>
  );
}

export function ShopDialog({ open, onOpenChange, shop }: { open: boolean; onOpenChange: (o: boolean) => void; shop?: ShopForm & { id: string } }) {
  const qc = useQueryClient();
  const [f, setF] = useState<ShopForm>({ name: shop?.name ?? "", contact_name: shop?.contact_name ?? "", phone: shop?.phone ?? "", address: shop?.address ?? "" });
  const m = useMutation({
    mutationFn: async () => {
      const row = { name: f.name.trim(), contact_name: f.contact_name.trim() || null, phone: f.phone.trim() || null, address: f.address.trim() || null };
      if (!row.name) throw new Error("Shop name is required");
      const { error } = shop ? await supabase.from("shops").update(row).eq("id", shop.id) : await supabase.from("shops").insert(row);
      if (error) throw error;
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
        <DialogHeader><DialogTitle>{shop ? "Edit shop" : "Add shop"}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="space-y-1.5"><Label>Shop name</Label><Input required maxLength={120} value={f.name} onChange={set("name")} /></div>
          <div className="space-y-1.5"><Label>Contact person</Label><Input maxLength={80} value={f.contact_name} onChange={set("contact_name")} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input type="tel" maxLength={20} value={f.phone} onChange={set("phone")} /></div>
          <div className="space-y-1.5"><Label>Address / area</Label><Input maxLength={200} value={f.address} onChange={set("address")} /></div>
          <Button type="submit" className="w-full" disabled={m.isPending}>Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
