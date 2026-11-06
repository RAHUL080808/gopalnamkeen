import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/format";

export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
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
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "tabular mt-1 text-lg font-extrabold sm:text-xl",
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
  return <div className={cn("rounded-xl border bg-card", className)}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{children}</div>;
}
