# Bókun Instant Checkout Rollout

## Objetivo

Transformar os 5 produtos da Tuk Tuk Lisbon em checkout imediato: o cliente escolhe dia e hora, paga o depósito no checkout Bókun e a reserva fica confirmada sem aviso de "on request".

Bókun deve ser a fonte da verdade para disponibilidade. Site, Viator, GetYourGuide e Lisa/WhatsApp precisam consultar ou criar reservas no Bókun antes de prometer qualquer horário.

## Produtos

| Produto | Slug | Bókun experience ID | Capacidade online |
| --- | --- | ---: | ---: |
| Alfama Tour | `alfama` | `1276905` | 12 lugares |
| Belem Tour | `belem` | `1273417` | 12 lugares |
| Chiado & Bairro Alto Tour | `chiado` | `1273418` | 12 lugares |
| Lisbon Full City Tour | `fullcity` | `1273419` | 12 lugares |
| Van Full Day Tour | `van` | `1273420` | 8 lugares |

Capacidade online dos tours de tuk-tuk = 2 tuk-tuks x 6 pessoas. Capacidade online do tour de van = 1 van x 8 pessoas.

Nota: o produto Alfama antigo `1272182` veio/importou regras do Viator e permanece como legado. O site usa o novo produto direto `1276905`.

## Alteração técnica preparada

Endpoint: `/api/bokun-tour-sync`

Ação preparada: `enable-instant-checkout`

O payload muda cada produto para:

- `bookingType`: `DATE_AND_TIME`
- `capacityType`: `LIMITED`
- `availabilityRules`: regra base existente preservada, com capacidade online e horários explícitos
- `startTimes`: horários explícitos por produto
- `rates`: preço por reserva privada, com todos os horários disponíveis na tarifa

Horários configurados:

| Produto | Horários |
| --- | --- |
| Alfama | 09:00, 11:00, 13:00, 15:00, 17:00 |
| Belem | 09:00, 11:30, 14:00, 16:30 |
| Chiado | 09:00, 11:30, 14:00, 16:30 |
| Full City | 09:00, 14:00 |
| Van | 09:00 |

## Bókun Resource Management

Antes de aplicar em produção, configurar no painel Bókun:

1. Criar tipo de recurso `Vehicle`.
2. Criar recursos `Tuk Tuk 1`, `Tuk Tuk 2` e `Van`.
3. Associar `Tuk Tuk 1` e `Tuk Tuk 2` aos produtos `alfama`, `belem`, `chiado` e `fullcity`.
4. Associar `Van` somente ao produto `van`.
5. Definir buffer operacional entre tours se necessário, por exemplo 30 minutos.
6. Se o guia/motorista também for gargalo, criar recursos de guia/motorista e associar aos produtos.

Sem Resource Management, `LIMITED` limita lugares por horário, mas não garante sozinho que dois produtos diferentes não usem o mesmo tuk-tuk no mesmo horário.

## Canais

### Site

O site já aponta para o checkout Bókun via `/booking.html` e lê os IDs em `/api/bokun-widget-config`. Depois que os produtos mudarem para `DATE_AND_TIME` + `LIMITED`, o aviso "on request" deve desaparecer do widget.

### Viator / Tripadvisor

No Bókun Marketplace/Channel Manager:

1. Conectar a conta Viator/Tripadvisor.
2. Mapear cada produto Viator para o mesmo Bókun experience ID acima.
3. Usar disponibilidade do Bókun, sem calendário separado.
4. Ativar confirmação instantânea só depois dos recursos estarem configurados.

### GetYourGuide

No Bókun Marketplace/Channel Manager, se a conta permitir conexão direta:

1. Conectar GetYourGuide.
2. Mapear os produtos GetYourGuide para os mesmos Bókun experience IDs.
3. Usar Bókun como disponibilidade mestre.
4. Fazer teste de conflito: reservar um horário no site e confirmar que ele reduz/bloqueia no GetYourGuide.

Se a conexão direta não estiver disponível na conta, o fallback operacional é inserir imediatamente no Bókun qualquer reserva que entrar pelo GetYourGuide.

## Lisa / WhatsApp / n8n

É possível ligar pelo n8n, mas o fluxo correto é:

1. Lisa coleta `tour`, `date`, `time`, `guests`, `pickup`, `name`, `email`, `phone`.
2. Lisa abre link de checkout Bókun quando o cliente quer pagar online.
3. Se a reserva for fechada por WhatsApp, n8n deve criar ou segurar a reserva no Bókun antes de responder "confirmado".
4. Bókun envia webhook de reserva para o site.
5. Site processa em `/api/bokun-booking-webhook`.
6. Site encaminha para Supabase/n8n/Lisa conforme variáveis de ambiente.

Endpoints existentes para o n8n:

- Webhook em tempo real: `POST /api/bokun-booking-webhook`
- Sincronização de fallback: `GET /api/bokun-booking-sync`

Variáveis relevantes:

- `BOKUN_ACCESS_KEY`
- `BOKUN_SECRET_KEY`
- `BOKUN_BOOKING_CHANNEL_UUID`
- `BOKUN_BOOKING_WEBHOOK_SECRET`
- `BOKUN_BOOKING_FORWARD_URL`
- `BOKUN_BOOKING_FORWARD_SECRET`
- `CONCIERGE_LEAD_WEBHOOK_URL`
- `CRON_SECRET`

## Execução segura

1. Configurar recursos no Bókun.
2. Rodar `enable-instant-checkout` em `dryRun: true` com `includePayload: true`.
3. Conferir horários, preços, capacidades e IDs.
4. Aplicar com `dryRun: false` somente depois da conferência.
5. Testar checkout dos 5 produtos no site.
6. Reservar um horário de teste no site e verificar bloqueio nos outros canais.
7. Conectar Viator/GetYourGuide ao Bókun e repetir o teste de conflito.
8. Ligar Lisa/n8n usando Bókun como regra: sem Bókun, sem confirmação.

## Referências oficiais

- Bókun product data model: https://bokun.dev/booking-api-rest/vU6sCfxwYdJWd1QAcLt12i/introduction-to-the-data-model-of-products/mGtiogVmyzywvDaZFK29b5
- Bókun `CAPACITY_TYPE`: https://bokun.dev/restful-api-for-creating-updating-and-accessing-experience-products/bhqyxa7kEuAYtM7J2go3Kh/component-capacity_type/bc8DWeA7gukjMsHxxqNi9W
- Bókun `AVAILABILITY_RULES`: https://bokun.dev/restful-api-for-creating-updating-and-accessing-experience-products/bhqyxa7kEuAYtM7J2go3Kh/component-availability_rules/cmcWqLSTLFpN1Tuvi6RCAF
- Bókun Resource Management: https://www.bokun.io/resource-management
- Bókun as channel manager: https://docs.bokun.io/en/articles/299-bokun-as-a-channel-manager
- n8n Webhook node: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook
