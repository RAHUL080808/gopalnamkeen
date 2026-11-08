import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Home, Store, FileText, IndianRupee, Users, HandCoins, History, LogOut, Wallet, Sparkles } from "lucide-react";
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

  const nav = me?.role === "owner" ? OWNER_NAV : me?.role === "driver" ? DRIVER_NAV : STAFF_NAV;

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/[0.07] via-background to-muted/50 pb-24 md:pb-8">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#101d3b]/95 text-white shadow-[0_8px_30px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-white/25 to-white/[0.06] text-white ring-1 ring-white/20 shadow-inner">
            <Wallet className="h-5 w-5" />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[#101d3b]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold tracking-tight">{me?.name || "CreditBook"}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-white/55">
              <span>Sai Sindhu Enterprises</span><span className="text-white/25">•</span><span className="capitalize">{me?.role ?? (isLoading ? "…" : "no access")}</span>
            </div>
          </div>
          {me?.role && (
            <nav className="hidden items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.06] p-1 md:flex">
              {nav.map((n) => (
                <Link key={n.to} to={n.to} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white/65 transition-all hover:bg-white/10 hover:text-white" activeProps={{ className: "bg-white text-[#142342] shadow-md" }}>
                  <n.icon className="h-3.5 w-3.5" />{n.label}
                </Link>
              ))}
            </nav>
          )}
          <button onClick={signOut} aria-label="Sign out" title="Sign out" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/75 transition hover:border-rose-300/30 hover:bg-rose-400/15 hover:text-white">
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 md:py-8">
        {isLoading ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><span className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />Preparing your workspace…</div>
        ) : !me?.role ? (
          <div className="mx-auto mt-10 max-w-lg rounded-3xl border border-border/70 bg-card p-7 text-center shadow-xl shadow-primary/[0.04]">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600"><Sparkles className="h-6 w-6" /></div>
            <h2 className="font-extrabold tracking-tight">No access yet</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Your account has no role yet. Ask the owner to add you as a driver or salesman.</p>
          </div>
        ) : me.role !== "owner" && (OWNER_ONLY.some((p) => pathname.startsWith(p)) || (pathname === "/shops" && me.role !== "owner" && me.role !== "driver")) ? (
          <div className="mx-auto mt-10 max-w-lg rounded-3xl border border-border/70 bg-card p-7 text-center text-sm text-muted-foreground shadow-lg">This page is for the owner only.</div>
        ) : children}
      </main>

      {me?.role && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/90 shadow-[0_-12px_40px_rgba(15,23,42,0.10)] backdrop-blur-2xl md:hidden">
          <div className="mx-auto flex max-w-md px-2 pb-[env(safe-area-inset-bottom)] pt-1.5">
            {nav.map((n) => {
              const active = pathname === n.to || (n.to !== "/home" && pathname.startsWith(n.to));
              return (
                <Link key={n.to} to={n.to} className={`relative flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold transition-all ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                  {active && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />}
                  <span className={`flex h-8 w-10 items-center justify-center rounded-xl transition-all ${active ? "bg-primary/10" : ""}`}><n.icon className="h-[19px] w-[19px]" /></span>
                  {n.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
