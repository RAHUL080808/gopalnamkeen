import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CreditBook — FMCG Credit & Collections" },
      { name: "description", content: "Manage shop bills, payment collections and outstanding balances." },
      { property: "og:title", content: "CreditBook — FMCG Credit & Collections" },
      { property: "og:description", content: "Manage shop bills, payment collections and outstanding balances." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/home" : "/auth" });
  },
});
