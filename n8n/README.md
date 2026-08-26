# n8n Lisa / Bókun / WhatsApp

Este diretório guarda o blueprint para ligar Lisa/WhatsApp ao Bókun sem criar dupla reserva.

## Regra operacional

Bókun é a fonte da verdade. Lisa pode coletar dados e mandar link de checkout, mas só deve responder "confirmado" quando:

- o checkout Bókun retornar reserva confirmada; ou
- uma reserva/hold manual for criado no Bókun antes da resposta no WhatsApp.

## Fluxos

### Reservas vindas do Bókun

1. Bókun envia webhook para o site: `POST /api/bokun-booking-webhook`.
2. O site normaliza a reserva.
3. O site encaminha para `BOKUN_BOOKING_FORWARD_URL`, que pode ser um webhook do n8n.
4. n8n envia a mensagem de confirmação/atualização para Lisa ou WhatsApp.

### Leads vindos da Lisa/site

1. Lisa/site envia lead para `POST /api/concierge-lead`.
2. O site encaminha para `CONCIERGE_LEAD_WEBHOOK_URL`, que pode ser outro webhook do n8n.
3. n8n cria/segura a reserva no Bókun ou envia o link de checkout.
4. WhatsApp só confirma depois do Bókun aceitar.

## Variáveis

No Vercel/site:

- `BOKUN_BOOKING_FORWARD_URL`: webhook n8n para reservas Bókun.
- `BOKUN_BOOKING_FORWARD_SECRET`: segredo enviado no header `X-TukTuk-Forward-Secret`.
- `CONCIERGE_LEAD_WEBHOOK_URL`: webhook n8n para leads da Lisa/site.
- `CONCIERGE_LEAD_WEBHOOK_SECRET`: assinatura HMAC dos leads.

No n8n:

- `LISA_WHATSAPP_WEBHOOK_URL`: endpoint da Lisa ou provedor WhatsApp Business.
- `BOKUN_MANUAL_BOOKING_URL`: endpoint interno que cria/segura reserva no Bókun, se for usado.
- `BOKUN_MANUAL_BOOKING_SECRET`: segredo desse endpoint interno.

## Arquivo importável

`lisa-bokun-whatsapp.workflow.json` é um ponto de partida importável no n8n. Ele recebe webhooks do site, normaliza o payload e encaminha para a Lisa/WhatsApp.

