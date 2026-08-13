# Site Concierge Lead Setup

The site concierge can send leads to Supabase, to an n8n webhook, or to both.

Recommended architecture:

```text
Website concierge
-> /api/concierge-lead
-> Supabase table "Leads - Tuk Tuk"
-> n8n follow-up workflow
-> email first, WhatsApp only when the customer provides or chooses it
```

Use the same Supabase project as Lisa/n8n if desired, but keep customer data in dedicated tables. Do not store customer leads inside n8n's internal workflow/execution tables.

Current Supabase project:

```text
Project: tuk-tuk-lisbon-tours
Project ref: fxmxcgqrbwvxnwejasqk
API URL: https://fxmxcgqrbwvxnwejasqk.supabase.co
Lead table: public."Leads - Tuk Tuk"
```

## Environment Variables

Supabase insert:

```text
SUPABASE_URL=https://fxmxcgqrbwvxnwejasqk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_LEADS_TABLE=Leads - Tuk Tuk
```

Optional n8n webhook:

```text
CONCIERGE_LEAD_WEBHOOK_URL=
CONCIERGE_LEAD_WEBHOOK_SECRET=
```

`SUPABASE_SERVICE_ROLE_KEY` and webhook secrets must stay only in Vercel Environment Variables.

## Lead Fields

The concierge collects the same operational details Lisa asks for before availability:

```text
tour of interest
desired date
preferred time
number of guests
pickup area or hotel
name
email
optional phone/WhatsApp
question/message
qualification: HOT, WARM, INFORMATIONAL
source: site_concierge
```

## Suggested Supabase Table

```sql
create table if not exists public."Leads - Tuk Tuk" (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public."Clientes - Tuk Tuk"(id) on delete set null,
  reserva_id bigint references public."Reservas"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
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
  qualificacao text not null check (qualificacao in ('HOT', 'WARM', 'INFORMATIONAL')),
  status text not null default 'novo',
  followup_status text not null default 'pendente',
  ultimo_followup_em timestamptz,
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
```

## n8n Follow-Up Pattern

Basic workflow:

```text
Trigger: Supabase row created in public."Leads - Tuk Tuk" or CONCIERGE_LEAD_WEBHOOK_URL
Filter: qualificacao is HOT or WARM
Action 1: send internal notification to Natanael
Action 2: send customer email confirmation/request follow-up
Action 3: if phone exists and customer consent/use is appropriate, prepare WhatsApp follow-up
Action 4: update status/followup_status in Supabase
Action 5: when the lead becomes a real customer or booking, set cliente_id and/or reserva_id
```

Do not send automatic WhatsApp messages through a personal `wa.me` link. For backend WhatsApp follow-up, use the official WhatsApp Business/Meta API or leave it as a manual owner action.
