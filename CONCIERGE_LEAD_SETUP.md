# Site Concierge Lead Setup

The site concierge sends leads to Supabase and can send immediate email notifications from the site backend.
An optional n8n webhook can still be used for Lisa/follow-up automation, but it is not required for immediate lead alerts.

Recommended architecture:

```text
Website concierge
-> /api/concierge-lead
-> Supabase table "Leads - Tuk Tuk"
-> backend email notification to contact@tuktuklisbon.tours
-> backend customer receipt email
-> Lisa/n8n follow-up workflow when available
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
SUPABASE_EDGE_LEAD_URL=https://fxmxcgqrbwvxnwejasqk.supabase.co/functions/v1/tuktuk-site-lead
```

Optional n8n webhook:

```text
CONCIERGE_LEAD_WEBHOOK_URL=
CONCIERGE_LEAD_WEBHOOK_SECRET=
```

Immediate email notifications:

```text
RESEND_API_KEY=
CONCIERGE_EMAIL_FROM=TukTuk Lisbon <contact@tuktuklisbon.tours>
CONCIERGE_NOTIFICATION_TO=contact@tuktuklisbon.tours
CONCIERGE_REPLY_TO=contact@tuktuklisbon.tours
CONCIERGE_EMAIL_NOTIFICATIONS_DISABLED=false
```

`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and webhook secrets must stay only in Vercel Environment Variables.
`CONCIERGE_NOTIFICATION_TO` is the internal inbox that receives each lead. `CONCIERGE_REPLY_TO` is the address customers can reply to after the automatic receipt email.

The MVP also includes a Supabase Edge Function fallback at `SUPABASE_EDGE_LEAD_URL`. This lets Vercel submit concierge leads to the Tuk Tuk Supabase project even when the Vercel project does not yet have a service role key configured. The Edge Function uses Supabase server-side secrets internally, validates the payload, applies rate limiting, and writes to `public."Leads - Tuk Tuk"`.

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
phone/WhatsApp
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
