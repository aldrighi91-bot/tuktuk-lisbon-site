# Lisa Instagram DM Setup

Webhook URL:

```text
https://www.tuktuklisbon.tours/api/instagram-webhook
```

Environment variables required in Vercel:

```text
META_VERIFY_TOKEN=choose-a-long-random-token
META_PAGE_ACCESS_TOKEN=page-or-instagram-messaging-access-token
META_SEND_ENDPOINT_ID=me
META_GRAPH_VERSION=v25.0
META_APP_SECRET=your-meta-app-secret
```

Meta Developer App setup:

1. Use an Instagram Business account connected to a Facebook Page.
2. Enable message access for connected tools in Instagram/Meta settings.
3. In the Meta app, configure Webhooks with the URL above.
4. Use the same value from `META_VERIFY_TOKEN` as the webhook verify token.
5. Subscribe to the Instagram `messages` webhook field.
6. Add the same app secret to `META_APP_SECRET` so the webhook can validate signed POST requests.
7. Make sure the app has the required Instagram messaging permissions before live traffic:
   `instagram_business_basic`, `instagram_manage_comments`, and `instagram_business_manage_messages`.

Current Lisa behavior:

- replies to greetings;
- sends tour prices when people ask about price/tours;
- asks date, time, people and pickup area for booking/availability;
- sends the WhatsApp link for faster confirmation.

No secrets should be committed to GitHub.
