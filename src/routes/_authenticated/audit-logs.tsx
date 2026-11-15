import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, ScrollText, CalendarDays, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/format";
import { Card, Empty } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/_authenticated/audit-logs")({
  head: () => pageMeta("Audit logs — Gopal Namkeen", "Review who changed business records and when."),
  component: AuditLogsPage,
});

type AuditLog = {
  id: string;
  event_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  changed_fields: Record<string, { old: unknown; new: unknown }>;
  new_data?: Record<string, unknown> | null;
};

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data: pages, isLoading, isError, refetch, isFetching, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["audit-logs"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("id,event_at,actor_id,actor_name,actor_email,action,entity_type,entity_id,entity_label,changed_fields,new_data")
        .order("event_at", { ascending: false })
        .range(pageParam, pageParam + 499);
      if (error) throw error;
      return (data ?? []) as AuditLog[];
    },
    getNextPageParam: (lastPage, allPages) => lastPage.length === 500 ? allPages.length * 500 : undefined,
    staleTime: 15_000,
  });
  const data = pages?.pages.flat() ?? [];

  const entities = useMemo(() => [...new Set(data.map((x) => x.entity_type))].sort(), [data]);
  const filtered = useMemo(() => data.filter((log) => {
    if (action !== "all" && log.action !== action) return false;
    if (entity !== "all" && log.entity_type !== entity) return false;
    const date = log.event_at.slice(0, 10);
    if (from && date < from) return false;
    if (to && date > to) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [log.actor_name, log.actor_email, log.entity_label, log.entity_type, log.action, log.entity_id]
      .some((v) => String(v ?? "").toLowerCase().includes(q))
      || Object.entries(log.changed_fields ?? {}).some(([key, value]) =>
        key.toLowerCase().includes(q)
        || displayValue(value.old).toLowerCase().includes(q)
        || displayValue(value.new).toLowerCase().includes(q)
      );
  }), [data, action, entity, from, to, search]);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#132443] via-[#20395f] to-[#315477] p-5 text-white shadow-xl shadow-slate-900/10 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border-[25px] border-white/[0.06]" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-white/55">System accountability</div>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl"><ScrollText className="h-6 w-6" /> Audit Logs</h1>
            <p className="mt-1 text-xs text-white/65">Every recorded change, who made it, and the before/after values.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="shrink-0 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"><RefreshCw className={cn("mr-1 h-4 w-4", isFetching && "animate-spin")} /> Refresh</Button>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 sm:grid-cols-3">
          <div><div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Loaded events</div><div className="mt-1 text-xl font-extrabold tabular">{data.length}</div></div>
          <div><div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Filtered events</div><div className="mt-1 text-xl font-extrabold tabular text-cyan-200">{filtered.length}</div></div>
          <div className="col-span-2 sm:col-span-1"><div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Coverage</div><div className="mt-1 text-sm font-bold">Bills · Payments · Shops · Team</div></div>
        </div>
      </section>

      <Card className="space-y-3 p-3 sm:p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search user, shop, bill, amount or field…" className="pl-9" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select value={action} onChange={(e) => setAction(e.target.value)} className="h-10 min-w-0 rounded-xl border bg-background px-3 text-sm"><option value="all">All actions</option><option value="INSERT">Created</option><option value="UPDATE">Edited</option><option value="DELETE">Deleted</option></select>
          <select value={entity} onChange={(e) => setEntity(e.target.value)} className="h-10 min-w-0 rounded-xl border bg-background px-3 text-sm"><option value="all">All record types</option>{entities.map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}</select>
          <label className="flex items-center gap-2 rounded-xl border bg-background px-2"><CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" /><input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-w-0 w-full bg-transparent py-2 text-xs" /></label>
          <label className="flex items-center gap-2 rounded-xl border bg-background px-2"><CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" /><input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-w-0 w-full bg-transparent py-2 text-xs" /></label>
        </div>
        <div className="flex justify-end"><button className="text-xs font-semibold text-primary" onClick={() => { setSearch(""); setAction("all"); setEntity("all"); setFrom(""); setTo(""); }}>Clear filters</button></div>
      </Card>

      {isLoading ? <Card className="p-8 text-center text-sm text-muted-foreground">Loading audit history…</Card>
        : isError ? <Card className="p-6 text-center text-sm text-destructive">Could not load audit logs. Check that the audit-log SQL migration has been applied.</Card>
        : filtered.length === 0 ? <Empty>No matching activity found.</Empty>
        : <div className="space-y-3">
          {filtered.map((log) => {
            const fields = Object.entries(log.changed_fields ?? {});
            return (
              <Card key={log.id} className="overflow-hidden border-border/70 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-3 sm:p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide", log.action === "INSERT" ? "bg-emerald-50 text-emerald-700" : log.action === "UPDATE" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700")}>{log.action}</span>
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{log.entity_type.replaceAll("_", " ")}</span>
                      <span className="text-sm font-extrabold">{log.entity_label ?? (log.entity_id ? log.entity_id.slice(0, 8) : "Record")}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{log.actor_name ?? "Unknown user"}{log.actor_email ? " · " + log.actor_email : ""}</div>
                  </div>
                  <time className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{fmtDateTime(log.event_at)}</time>
                </div>
                {typeof log.new_data?._historical_note === "string" && <div className="border-b border-border/60 bg-sky-50/70 px-3 py-2 text-xs text-sky-900 sm:px-4">{String(log.new_data._historical_note)}</div>}
                <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4">
                  {fields.map(([key, value]) => (
                    <div key={key} className="min-w-0 rounded-xl bg-muted/45 p-2.5">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{key.replaceAll("_", " ")}</div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-xs">
                        <span className="break-all text-muted-foreground">{displayValue(value.old)}</span>
                        <span className="font-bold text-primary">→</span>
                        <span className="break-all font-semibold text-foreground">{displayValue(value.new)}</span>
                      </div>
                    </div>
                  ))}
                  {fields.length === 0 && <p className="text-xs text-muted-foreground">No field-level differences recorded.</p>}
                </div>
              </Card>
            );
          })}
          {hasNextPage && <div className="flex justify-center"><Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>{isFetchingNextPage ? "Loading older events…" : "Load older events"}</Button></div>}
          <p className="text-center text-xs text-muted-foreground">Loaded {data.length} events. Continue loading to browse older activity.</p>
        </div>}
    </div>
  );
}
