# Site Concierge Lead Setup

The site concierge can send leads to Supabase, to an n8n webhook, or to both.

Recommended architecture:

```text
Website concierge
-> /api/concierge-lead
-> Supabase lead table
-> n8n follow-up workflow
-> email first, WhatsApp only when the customer provides or chooses it
```

Use the same Supabase project as Lisa/n8n if desired, but keep customer data in dedicated tables. Do not store customer leads inside n8n's internal workflow/execution tables.

## Environment Variables

Supabase insert:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_LEADS_TABLE=concierge_leads
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
create table if not exists public.concierge_leads (
  id uuid primary key,
  created_at timestamptz not null,
  source text not null,
  name text not null,
  email text not null,
  phone text,
  desired_date text not null,
  preferred_time text not null,
  guests integer not null,
  pickup_area text not null,
  tour_id text not null,
  message text,
  source_path text,
  qualification text not null check (qualification in ('HOT', 'WARM', 'INFORMATIONAL')),
  status text not null default 'new',
  followup_status text not null default 'pending',
  last_followup_at timestamptz,
  created_by_channel text not null default 'site_concierge'
);
```

## n8n Follow-Up Pattern

Basic workflow:

```text
Trigger: Supabase row created or CONCIERGE_LEAD_WEBHOOK_URL
Filter: qualification is HOT or WARM
Action 1: send internal notification to Natanael
Action 2: send customer email confirmation/request follow-up
Action 3: if phone exists and customer consent/use is appropriate, prepare WhatsApp follow-up
Action 4: update status/followup_status in Supabase
```

Do not send automatic WhatsApp messages through a personal `wa.me` link. For backend WhatsApp follow-up, use the official WhatsApp Business/Meta API or leave it as a manual owner action.
