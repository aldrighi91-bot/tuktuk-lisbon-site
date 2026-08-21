# Bókun booking sync

The online checkout runs inside the Bókun widget. Customer details entered there are owned by Bókun until Bókun notifies our backend.

This site now exposes:

```text
POST /api/bokun-booking-webhook
```

## Reservation flow

```text
Bókun booking webhook
-> /api/bokun-booking-webhook
-> Bókun REST lookup /booking.json/booking/{confirmationCode or id}
-> Supabase
-> n8n / Lisa follow-up
```

The endpoint accepts the normal Bókun webhook payload that contains `bookingId`. It then fetches the full booking details from Bókun before saving or forwarding.

## Data saved

The normalized record includes:

- booking reference / confirmation code
- booking status and webhook event
- customer name
- customer email
- customer phone
- tour
- tour date
- tour time
- number of guests
- pickup note
- total price
- deposit paid
- remaining balance
- payment status
- raw Bókun JSON for audit

## Delivery modes

### Current safe fallback with database linking

If Vercel does not have a Supabase service role key, the endpoint posts a HOT lead to the existing Supabase Edge Function:

```text
https://fxmxcgqrbwvxnwejasqk.supabase.co/functions/v1/tuktuk-site-lead
```

That writes into:

```text
public."Leads - Tuk Tuk"
```

with:

```text
origem = bokun_checkout
qualificacao = HOT
```

The Supabase trigger `tuktuk_link_bokun_checkout_lead` then links that lead into:

```text
public."Clientes - Tuk Tuk"
public."Reservas"
```

So Lisa/n8n can follow up from the same database pattern even without a Vercel service role key.

### Optional direct database sync

The endpoint also supports writing directly into `Clientes - Tuk Tuk`, `Reservas`, and `Leads - Tuk Tuk`. This is optional because the Edge Function + trigger already handles the current production flow. To enable direct writes from Vercel, add:

```text
SUPABASE_URL=https://fxmxcgqrbwvxnwejasqk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key>
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code.

### Optional n8n forward

To trigger Lisa directly from n8n, add:

```text
BOKUN_BOOKING_FORWARD_URL=<n8n production webhook URL>
BOKUN_BOOKING_FORWARD_SECRET=<optional HMAC secret>
```

## Webhook security

Preferred:

```text
BOKUN_BOOKING_WEBHOOK_SECRET=<Bókun webhook/app secret>
```

The endpoint verifies the official `x-bokun-hmac` header when Bókun provides it.

Manual fallback:

```text
BOKUN_BOOKING_WEBHOOK_TOKEN=<random long token>
```

Then configure the Bókun URL as:

```text
https://tuktuklisbon.tours/api/bokun-booking-webhook?token=<same token>
```

## Bókun setup

In Bókun:

1. Go to `Settings -> Connections -> Webhooks`.
2. Create a booking webhook.
3. Type: HTTP Booking notification.
4. URL: `https://tuktuklisbon.tours/api/bokun-booking-webhook`
5. Data format: JSON.
6. Enable:
   - booking confirmed / created
   - booking updated
   - booking cancelled

If using the token fallback, include the token query parameter in the URL.

## Abandoned cart

Bókun has native abandoned cart emails. This is not exposed as the same booking webhook.

Recommended setup:

1. In Bókun, enable `Settings -> Auto messages -> Abandoned cart`.
2. Make sure terms, privacy policy, and marketing subscription settings are enabled in the booking channel.
3. Use Bókun's abandoned cart email for customers who typed contact details inside checkout but did not purchase.
4. Use Lisa/n8n for abandonment only when the site already captured contact details before checkout.

For Lisa-controlled abandonment:

```text
site concierge lead saved
-> customer clicks Book Online
-> no matching Bókun booking after delay
-> n8n marks abandoned_checkout
-> Lisa sends follow-up
```
