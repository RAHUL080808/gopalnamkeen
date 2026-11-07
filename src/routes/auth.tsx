import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Sai Sindhu Enterprises" },
      { name: "description", content: "Staff sign in for owner, drivers and salesmen." },
      { property: "og:title", content: "Sign in — CreditBook" },
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
    <div className="flex min-h-screen flex-col bg-background">
      <div className="bg-primary px-6 pb-16 pt-14 text-primary-foreground">
        <div className="mx-auto max-w-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success text-success-foreground">
            <Wallet className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight">CreditBook</h1>
          <p className="mt-1 text-sm opacity-80">Shop credit, bills & collections</p>
        </div>
      </div>
      <div className="-mt-10 px-4">
        <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-lg">
          <h2 className="text-lg font-bold">{mode === "signin" ? "Staff sign in" : "Create owner account"}</h2>
          {mode === "setup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create owner account"}
          </Button>
          {ownerExists === false && (
            <button type="button" className="w-full text-sm font-medium text-accent-foreground" onClick={() => setMode(mode === "signin" ? "setup" : "signin")}>
              {mode === "signin" ? "First time? Set up the owner account" : "Back to sign in"}
            </button>
          )}
          {ownerExists && (
            <p className="text-center text-xs text-muted-foreground">Driver and salesman accounts are created by the owner.</p>
          )}
        </form>
      </div>
    </div>
  );
}
