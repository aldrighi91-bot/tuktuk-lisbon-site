revoke all on function public.tuktuk_check_site_lead_rate_limit(text, timestamptz, integer)
  from public, anon, authenticated;

grant execute on function public.tuktuk_check_site_lead_rate_limit(text, timestamptz, integer)
  to service_role;
