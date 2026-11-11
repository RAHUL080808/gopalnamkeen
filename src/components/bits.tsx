import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/format";

export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-extrabold tracking-[-0.045em] text-slate-950 sm:text-[1.9rem]">{title}</h1>
      {action}
    </div>
  );
}

export function StatusBadge({ status: s }: { status: string | null }) {
  const status = s ?? "unpaid";
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em]",
      status === "paid" && "border-emerald-200 bg-emerald-50 text-emerald-800",
      status === "partial" && "border-amber-200 bg-amber-50 text-amber-800",
      status === "unpaid" && "border-rose-200 bg-rose-50 text-rose-700",
    )}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" | "primary" }) {
  return (
    <div className="group min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_3px_16px_rgba(15,23,42,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-slate-900/[0.06] sm:p-5">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      <div className={cn(
        "tabular mt-2 break-words text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl",
        tone === "success" && "text-emerald-700",
        tone === "danger" && "text-rose-700",
        tone === "primary" && "text-[#1d355b]",
      )}>{value}</div>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_18px_rgba(15,23,42,0.045)] transition-shadow duration-200", className)}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-9 text-center text-sm text-slate-500 shadow-sm">{children}</div>;
}
