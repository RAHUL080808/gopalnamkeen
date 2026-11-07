import { Link, useLocation, useNavigate } from "@tanstack/react-router";

const OWNER_ONLY = ["/shops", "/bills", "/payments", "/team"];
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Home, Store, FileText, IndianRupee, Users, HandCoins, History, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";

const OWNER_NAV = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/shops", label: "Shops", icon: Store },
  { to: "/bills", label: "Bills", icon: FileText },
  { to: "/payments", label: "Payments", icon: IndianRupee },
  { to: "/team", label: "Team", icon: Users },
] as const;

const STAFF_NAV = [
  { to: "/home", label: "Collect", icon: HandCoins },
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

  const nav = me?.role === "owner" ? OWNER_NAV : STAFF_NAV;

  return (
    <div className="min-h-screen bg-muted/40 pb-24 md:pb-8">
      <header className="sticky top-0 z-20 bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success text-success-foreground">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{me?.name || "CreditBook"}</div>
            <div className="text-xs capitalize opacity-75">Sai Sindhu Enterprises · {me?.role ?? (isLoading ? "…" : "no access")}</div>
          </div>
          {me?.role && (
            <nav className="hidden gap-1 md:flex">
              {nav.map((n) => (
                <Link key={n.to} to={n.to} className="rounded-md px-3 py-1.5 text-sm opacity-80 hover:opacity-100" activeProps={{ className: "bg-sidebar-accent opacity-100" }}>
                  {n.label}
                </Link>
              ))}
            </nav>
          )}
          <button onClick={signOut} aria-label="Sign out" className="rounded-md p-2 opacity-80 hover:opacity-100">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !me?.role ? (
          <div className="rounded-xl border bg-card p-6 text-center">
            <h2 className="font-bold">No access</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your account has no role yet. Ask the owner to add you as a driver or salesman.</p>
          </div>
        ) : me.role !== "owner" && OWNER_ONLY.some((p) => pathname.startsWith(p)) ? (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">This page is for the owner only.</div>
        ) : (
          children
        )}
      </main>

      {me?.role && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-card md:hidden">
          <div className="mx-auto flex max-w-md">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted-foreground"
                activeProps={{ className: "text-primary" }}
              >
                <n.icon className="h-5 w-5" />
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
