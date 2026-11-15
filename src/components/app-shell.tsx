import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Home, Store, FileText, IndianRupee, Users, HandCoins, History, LogOut, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";

const OWNER_ONLY = ["/bills", "/payments", "/team"];

const OWNER_NAV = [
  { to: "/home", label: "Overview", icon: Home },
  { to: "/shops", label: "Shops", icon: Store },
  { to: "/bills", label: "Bills", icon: FileText },
  { to: "/payments", label: "Payments", icon: IndianRupee },
  { to: "/team", label: "Team", icon: Users },
] as const;

const STAFF_NAV = [
  { to: "/home", label: "Collect", icon: HandCoins },
  { to: "/history", label: "My history", icon: History },
] as const;

const DRIVER_NAV = [
  { to: "/home", label: "Collect", icon: HandCoins },
  { to: "/shops", label: "Shops", icon: Store },
  { to: "/history", label: "My history", icon: History },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isDriver = me?.role === "driver";
  const nav = me?.role === "owner" ? OWNER_NAV : isDriver ? DRIVER_NAV : STAFF_NAV;

  return (
    <div className={`min-h-screen text-slate-900 ${isDriver ? "bg-[#f3f7f6] pb-[calc(6.25rem+env(safe-area-inset-bottom))] md:pb-8" : "bg-[#f4f7fb] pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8"}`}>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 text-slate-900 shadow-[0_4px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className={`mx-auto flex items-center gap-3 px-4 sm:px-6 ${isDriver ? "max-w-2xl py-2.5" : "max-w-7xl py-3"}`}>
          <div className={`flex shrink-0 items-center justify-center overflow-hidden ring-1 ring-slate-200 ${isDriver ? "h-10 w-10 rounded-[14px] bg-white" : "h-11 w-11 rounded-2xl bg-slate-50"}`}>
            <img src="/icons/sai-sindhu-logo.svg" alt="Sai Sindhu Enterprises" className="h-full w-full object-contain p-1" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold tracking-tight text-slate-900">Sai Sindhu Enterprises</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-slate-500">
              <span>Business Management</span><span className="text-slate-300">•</span><span className="capitalize text-emerald-700">{isDriver ? "Field App" : me?.role ?? (isLoading ? "…" : "no access")}</span>
            </div>
          </div>
          {me?.role && (
            <nav className="hidden items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 md:flex">
              {nav.map((n) => (
                <Link key={n.to} to={n.to} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 transition-all hover:bg-white hover:text-slate-950 hover:shadow-sm" activeProps={{ className: "bg-[#142342] text-white shadow-sm" }}>
                  <n.icon className="h-3.5 w-3.5" />{n.label}
                </Link>
              ))}
            </nav>
          )}
          <button onClick={signOut} aria-label="Sign out" title="Sign out" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600">
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <main className={`mx-auto px-3 sm:px-6 ${isDriver ? "max-w-2xl py-3 md:py-6" : "max-w-7xl py-5 md:py-8"}`}>
        {isLoading ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-slate-500"><span className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-100 border-t-emerald-700" />Preparing your workspace…</div>
        ) : !me?.role ? (
          <div className="mx-auto mt-10 max-w-lg rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-xl shadow-slate-900/[0.04]">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Sparkles className="h-6 w-6" /></div>
            <h2 className="font-extrabold tracking-tight text-slate-900">No access yet</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">Your account has no role yet. Ask the owner to add you as a driver or salesman.</p>
          </div>
        ) : me.role !== "owner" && (OWNER_ONLY.some((p) => pathname.startsWith(p)) || (pathname === "/shops" && me.role !== "driver")) ? (
          <div className="mx-auto mt-10 max-w-lg rounded-3xl border border-slate-200 bg-white p-7 text-center text-sm text-slate-500 shadow-lg">This page is for the owner only.</div>
        ) : children}
      </main>

      {me?.role && (
        <nav className={`fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-xl md:hidden ${isDriver ? "border-slate-200/80 bg-white/96 shadow-[0_-10px_32px_rgba(15,23,42,0.10)]" : "border-slate-200 bg-white/95 shadow-[0_-8px_28px_rgba(15,23,42,0.08)]"}`}>
          <div className={`mx-auto flex px-3 pb-[max(0.55rem,env(safe-area-inset-bottom))] ${isDriver ? "max-w-2xl gap-2 pt-2" : "max-w-md pt-2"}`}>
            {nav.map((n) => {
              const active = pathname === n.to || (n.to !== "/home" && pathname.startsWith(n.to));
              const label = isDriver && n.to === "/home" ? "Home" : n.label;
              return (
                <Link key={n.to} to={n.to} className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-2 text-[10px] font-extrabold transition-all ${active ? "bg-emerald-50 text-emerald-800" : "text-slate-400 hover:bg-slate-50 hover:text-slate-700"}`}>
                  <n.icon className={isDriver ? "h-5 w-5" : "h-[19px] w-[19px]"} />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
