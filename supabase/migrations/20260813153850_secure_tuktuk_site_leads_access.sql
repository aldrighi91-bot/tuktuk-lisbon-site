revoke all on table public."Leads - Tuk Tuk" from anon;
revoke all on table public."Leads - Tuk Tuk" from authenticated;

grant select, insert, update, delete on table public."Leads - Tuk Tuk" to service_role;

drop policy if exists "service_role_manage_tuktuk_site_leads" on public."Leads - Tuk Tuk";
create policy "service_role_manage_tuktuk_site_leads"
  on public."Leads - Tuk Tuk"
  for all
  to service_role
  using (true)
  with check (true);
