import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/format";

export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-extrabold tracking-[-0.04em] text-foreground sm:text-[1.85rem]">{title}</h1>
      {action}
    </div>
  );
}

export function StatusBadge({ status: s }: { status: string | null }) {
  const status = s ?? "unpaid";
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide",
      status === "paid" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      status === "partial" && "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      status === "unpaid" && "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    )}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" | "primary" }) {
  return (
    <div className="group min-w-0 rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/45 p-4 shadow-sm shadow-black/[0.035] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/[0.05] sm:p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className={cn(
        "tabular mt-2 break-words text-lg font-extrabold tracking-tight sm:text-xl",
        tone === "success" && "text-emerald-600",
        tone === "danger" && "text-rose-600",
        tone === "primary" && "text-primary",
      )}>{value}</div>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-border/70 bg-card shadow-[0_4px_24px_rgba(15,23,42,0.035)] transition-shadow duration-200", className)}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-border/80 bg-gradient-to-br from-card to-muted/40 p-9 text-center text-sm text-muted-foreground shadow-sm">{children}</div>;
}
