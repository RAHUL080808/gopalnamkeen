import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/format";

export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[1.7rem]">{title}</h1>
      {action}
    </div>
  );
}

export function StatusBadge({ status: s }: { status: string | null }) {
  const status = s ?? "unpaid";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        status === "paid" && "bg-accent text-accent-foreground",
        status === "partial" && "bg-warning/25 text-warning-foreground",
        status === "unpaid" && "bg-destructive/10 text-destructive",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" | "primary" }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card to-muted/30 p-4 shadow-sm shadow-black/[0.04] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "tabular mt-1.5 text-lg font-extrabold tracking-tight sm:text-xl",
          tone === "success" && "text-success",
          tone === "danger" && "text-destructive",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-border/70 bg-card shadow-sm shadow-black/[0.04]", className)}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card/70 p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
