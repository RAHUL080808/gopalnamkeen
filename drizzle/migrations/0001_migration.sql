create or replace function public.owner_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where role = 'owner')
$$;
grant execute on function public.owner_exists() to anon, authenticated;