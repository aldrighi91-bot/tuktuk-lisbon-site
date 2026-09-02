create table if not exists public."Lead Rate Limits - Tuk Tuk" (
  bucket_key text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket_key, window_start)
);

alter table public."Lead Rate Limits - Tuk Tuk" enable row level security;

revoke all on table public."Lead Rate Limits - Tuk Tuk" from anon, authenticated;
grant select, insert, update, delete on table public."Lead Rate Limits - Tuk Tuk" to service_role;

drop policy if exists "service_role_manage_tuktuk_site_lead_rate_limits" on public."Lead Rate Limits - Tuk Tuk";
create policy "service_role_manage_tuktuk_site_lead_rate_limits"
  on public."Lead Rate Limits - Tuk Tuk"
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.tuktuk_check_site_lead_rate_limit(
  p_bucket_key text,
  p_window_start timestamptz,
  p_max_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public."Lead Rate Limits - Tuk Tuk" (
    bucket_key,
    window_start,
    request_count,
    updated_at
  )
  values (
    left(coalesce(p_bucket_key, 'unknown'), 128),
    p_window_start,
    1,
    now()
  )
  on conflict (bucket_key, window_start)
  do update set
    request_count = public."Lead Rate Limits - Tuk Tuk".request_count + 1,
    updated_at = now()
  returning request_count into v_count;

  delete from public."Lead Rate Limits - Tuk Tuk"
  where window_start < now() - interval '2 hours';

  return v_count <= greatest(p_max_requests, 1);
end;
$$;

revoke all on function public.tuktuk_check_site_lead_rate_limit(text, timestamptz, integer) from public;
grant execute on function public.tuktuk_check_site_lead_rate_limit(text, timestamptz, integer) to service_role;
