import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Store } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Sai Sindhu Enterprises" },
      { name: "description", content: "Staff sign in for owner, drivers and salesmen." },
      { property: "og:title", content: "Sign in — Sai Sindhu Enterprises" },
      { property: "og:description", content: "Staff sign in for owner, drivers and salesmen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [ownerExists, setOwnerExists] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"signin" | "setup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/home", replace: true });
    });
    supabase.rpc("owner_exists").then(({ data }) => setOwnerExists(!!data));
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/home", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/home", replace: true });
        else toast.success("Check your email to confirm the owner account, then sign in.");
        setMode("signin");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#f3f6fa]">
      <div className="absolute inset-x-0 top-0 h-[48%] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-700 via-[#142342] to-[#0b1730]" />
      <div className="pointer-events-none absolute -right-20 top-16 h-72 w-72 rounded-full border-[36px] border-white/[0.045]" />
      <div className="pointer-events-none absolute -left-24 top-44 h-56 w-56 rounded-full border-[28px] border-white/[0.04]" />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-10 pt-12 sm:pt-16">
        <div className="mb-12 text-center text-white">
          <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-[26px] border border-white/20 bg-white p-2 shadow-2xl shadow-black/20">
            <img src="/icons/sai-sindhu-logo.svg" alt="Sai Sindhu Enterprises" className="h-full w-full object-contain" />
          </div>
          <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.25em] text-emerald-200">Sai Sindhu Enterprises</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Business Desk</h1>
          <p className="mt-2 text-sm text-white/65">Bills, collections & shop accounts — all in one place.</p>
        </div>

        <form onSubmit={submit} className="relative space-y-5 rounded-[28px] border border-white/80 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.16)] sm:p-8">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><ShieldCheck className="h-5 w-5" /></div>
            <div><h2 className="text-lg font-extrabold tracking-tight text-slate-900">{mode === "signin" ? "Welcome back" : "Create owner account"}</h2><p className="text-xs text-slate-500">{mode === "signin" ? "Sign in to continue to your workspace" : "Set up the business owner account"}</p></div>
          </div>
          {mode === "setup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-slate-700">Your name</Label>
              <Input id="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl border-slate-200 bg-slate-50/70 focus-visible:ring-emerald-600" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-slate-700">Email address</Label>
            <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 rounded-xl border-slate-200 bg-slate-50/70 focus-visible:ring-emerald-600" placeholder="name@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-slate-700">Password</Label>
            <Input id="password" type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl border-slate-200 bg-slate-50/70 focus-visible:ring-emerald-600" placeholder="Enter your password" />
          </div>
          <Button type="submit" className="h-12 w-full rounded-xl bg-[#142342] text-base font-bold text-white shadow-lg shadow-slate-900/15 transition hover:bg-emerald-800" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in to dashboard" : "Create owner account"}
          </Button>
          {ownerExists === false && (
            <button type="button" className="w-full text-sm font-semibold text-emerald-800 hover:text-emerald-950" onClick={() => setMode(mode === "signin" ? "setup" : "signin")}>
              {mode === "signin" ? "First time? Set up the owner account" : "Back to sign in"}
            </button>
          )}
          {ownerExists && (
            <p className="text-center text-xs text-slate-500">Driver and salesman accounts are created by the owner.</p>
          )}
        </form>
        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] font-medium text-slate-400"><Store className="h-3.5 w-3.5" /> Secure workspace for your business team</div>
      </div>
    </div>
  );
}
