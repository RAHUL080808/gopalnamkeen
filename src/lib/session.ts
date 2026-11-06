import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "owner" | "driver" | "salesman";

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      supabase.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle(),
    ]);
    const role = (roles?.[0]?.role ?? null) as Role | null;
    return { id: u.user.id, email: u.user.email ?? "", name: profile?.full_name ?? "", role };
  },
  staleTime: 60_000,
});

export function useMe() {
  return useQuery(meQuery);
}
