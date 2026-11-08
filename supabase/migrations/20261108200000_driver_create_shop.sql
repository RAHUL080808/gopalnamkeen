-- Allow drivers to add a shop from the app without granting broad table INSERT access.
create or replace function public.driver_create_shop(
  _name text,
  _contact_name text default null,
  _phone text default null,
  _address text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _shop_id uuid;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'driver'::public.app_role) then
    raise exception 'Only drivers can use this action';
  end if;

  if nullif(trim(_name), '') is null then
    raise exception 'Shop name is required';
  end if;

  insert into public.shops (name, contact_name, phone, address)
  values (trim(_name), nullif(trim(_contact_name), ''), nullif(trim(_phone), ''), nullif(trim(_address), ''))
  returning id into _shop_id;

  return _shop_id;
end;
$$;

revoke all on function public.driver_create_shop(text, text, text, text) from public;
grant execute on function public.driver_create_shop(text, text, text, text) to authenticated;
