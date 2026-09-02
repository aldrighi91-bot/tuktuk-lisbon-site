alter table public."Leads - Tuk Tuk"
  add column if not exists cliente_id uuid references public."Clientes - Tuk Tuk"(id) on delete set null,
  add column if not exists reserva_id bigint references public."Reservas"(id) on delete set null;

create index if not exists leads_tuk_tuk_cliente_id_idx on public."Leads - Tuk Tuk" (cliente_id);
create index if not exists leads_tuk_tuk_reserva_id_idx on public."Leads - Tuk Tuk" (reserva_id);
