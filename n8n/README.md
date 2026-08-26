# n8n Lisa / Bókun / WhatsApp

Este diretório guarda o blueprint para ligar Lisa/WhatsApp ao Bókun sem criar dupla reserva.

## Regra operacional

Bókun é a fonte da verdade para checkout online. Como a conta está no plano Start, não usamos Allocation Manager. Se houver conflito de veículo, o tour pode ser repassado para parceiro operacional.

Lisa pode coletar dados e mandar o link direto de checkout Bókun. Quando a venda acontecer por WhatsApp/manual, só responder "confirmado" depois que:

- o checkout Bókun retornar reserva confirmada; ou
- uma reserva/hold manual for criado no Bókun.

## Fluxos

### Reservas vindas do Bókun

1. Bókun envia webhook para o site: `POST /api/bokun-booking-webhook`.
2. O site normaliza a reserva.
3. O site encaminha para `BOKUN_BOOKING_FORWARD_URL`, que pode ser um webhook do n8n.
4. n8n envia a mensagem de confirmação/atualização para Lisa ou WhatsApp.

### Leads vindos da Lisa/site

1. Lisa/site envia lead para `POST /api/concierge-lead`.
2. O site encaminha para `CONCIERGE_LEAD_WEBHOOK_URL`, que pode ser outro webhook do n8n.
3. O payload já traz `bookingCheckoutUrl`, pronto para Lisa/WhatsApp enviar ao cliente.
4. Se o cliente não usar o checkout, n8n cria/segura a reserva no Bókun ou encaminha para operação manual.
5. WhatsApp só confirma depois do Bókun aceitar ou depois da confirmação operacional.

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

