create table if not exists public."Leads - Tuk Tuk" (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  origem text not null default 'site_concierge',
  canal text not null default 'site',
  agente text not null default 'concierge_site',
  nome text not null,
  email text not null,
  telefone text,
  tour text not null,
  tour_slug text not null,
  data_tour text not null,
  hora_tour text not null,
  pessoas integer not null check (pessoas > 0 and pessoas <= 60),
  pickup text not null,
  mensagem text,
  source_path text,
  qualificacao text not null default 'WARM' check (qualificacao in ('HOT', 'WARM', 'INFORMATIONAL')),
  status text not null default 'novo',
  followup_status text not null default 'pendente',
  ultimo_followup_em timestamp with time zone,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  gclid text,
  gbraid text,
  wbraid text,
  raw_json jsonb not null default '{}'::jsonb
);

alter table public."Leads - Tuk Tuk" enable row level security;

create index if not exists leads_tuk_tuk_created_at_idx on public."Leads - Tuk Tuk" (created_at desc);
create index if not exists leads_tuk_tuk_status_idx on public."Leads - Tuk Tuk" (status, followup_status);
create index if not exists leads_tuk_tuk_qualificacao_idx on public."Leads - Tuk Tuk" (qualificacao);
create index if not exists leads_tuk_tuk_tour_slug_idx on public."Leads - Tuk Tuk" (tour_slug);
create index if not exists leads_tuk_tuk_email_idx on public."Leads - Tuk Tuk" (email);

comment on table public."Leads - Tuk Tuk" is 'Leads captured by the website AI concierge before manual availability confirmation or conversion into Reservas.';
