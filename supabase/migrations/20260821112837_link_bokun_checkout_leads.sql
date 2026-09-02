create or replace function public.tuktuk_link_bokun_checkout_lead()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bokun jsonb;
  v_cliente_id uuid;
  v_reserva_id bigint;
  v_ticket_id text;
  v_preco_total numeric;
  v_deposito numeric;
  v_restante numeric;
begin
  if new.origem <> 'bokun_checkout' then
    return new;
  end if;

  v_bokun := new.raw_json -> 'bokun';
  if v_bokun is null or jsonb_typeof(v_bokun) <> 'object' then
    return new;
  end if;

  v_ticket_id := nullif(
    coalesce(
      v_bokun ->> 'bookingReference',
      v_bokun ->> 'bookingId',
      v_bokun ->> 'productConfirmationCode',
      new.id::text
    ),
    ''
  );

  if v_ticket_id is null or new.telefone is null or new.telefone = '' then
    return new;
  end if;

  v_preco_total := nullif(v_bokun ->> 'totalPrice', '')::numeric;
  v_deposito := nullif(v_bokun ->> 'depositPaid', '')::numeric;
  v_restante := nullif(v_bokun ->> 'remainingDue', '')::numeric;

  insert into public."Clientes - Tuk Tuk" (
    nome,
    telefone,
    email,
    agente,
    user_profile,
    status,
    role
  )
  values (
    new.nome,
    new.telefone,
    new.email,
    'bokun_checkout',
    'online_booking',
    'ativo',
    'cliente'
  )
  on conflict (telefone) do update
    set nome = coalesce(nullif(excluded.nome, ''), public."Clientes - Tuk Tuk".nome),
        email = coalesce(nullif(excluded.email, ''), public."Clientes - Tuk Tuk".email),
        agente = 'bokun_checkout',
        user_profile = coalesce(public."Clientes - Tuk Tuk".user_profile, 'online_booking'),
        status = coalesce(public."Clientes - Tuk Tuk".status, 'ativo')
  returning id into v_cliente_id;

  insert into public."Reservas" (
    ticket_id,
    telefone,
    nome,
    email,
    tour,
    data_tour,
    hora_tour,
    pessoas,
    preco_total,
    deposito,
    restante,
    idioma
  )
  values (
    v_ticket_id,
    new.telefone,
    new.nome,
    new.email,
    new.tour,
    new.data_tour,
    new.hora_tour,
    new.pessoas,
    v_preco_total,
    v_deposito,
    v_restante,
    'en'
  )
  on conflict (ticket_id) do update
    set telefone = excluded.telefone,
        nome = excluded.nome,
        email = excluded.email,
        tour = excluded.tour,
        data_tour = excluded.data_tour,
        hora_tour = excluded.hora_tour,
        pessoas = excluded.pessoas,
        preco_total = excluded.preco_total,
        deposito = excluded.deposito,
        restante = excluded.restante
  returning id into v_reserva_id;

  new.cliente_id := coalesce(new.cliente_id, v_cliente_id);
  new.reserva_id := coalesce(new.reserva_id, v_reserva_id);
  new.canal := 'bokun';
  new.agente := 'bokun_webhook';
  new.status := coalesce(nullif(v_bokun ->> 'status', ''), 'reserva_bokun_recebida');
  new.followup_status := coalesce(nullif(new.followup_status, ''), 'pendente');

  return new;
end;
$$;

revoke all on function public.tuktuk_link_bokun_checkout_lead() from public;

drop trigger if exists tuktuk_link_bokun_checkout_lead_before_write
  on public."Leads - Tuk Tuk";

create trigger tuktuk_link_bokun_checkout_lead_before_write
  before insert or update of origem, raw_json, telefone, nome, email, tour, data_tour, hora_tour, pessoas
  on public."Leads - Tuk Tuk"
  for each row
  execute function public.tuktuk_link_bokun_checkout_lead();
