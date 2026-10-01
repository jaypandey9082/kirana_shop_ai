# n8n: approved-action workflow

`workflows/approved-action.json` is a starting workflow. **It has not been run against a
live n8n instance yet.** Import it in n8n (Workflows → Import from file), then:

1. In n8n's environment set `KIRANA_WEBHOOK_SECRET` (same value as the app's
   `N8N_WEBHOOK_SECRET`), `KIRANA_CALLBACK_SECRET` (same as `N8N_CALLBACK_SECRET`) and
   `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (for the signature check).
2. Activate the workflow and copy its production webhook URL into the app's `N8N_WEBHOOK_URL`.
3. Add a step between "Verify signature" and the callback if you want n8n to do more
   (e.g. a WhatsApp Business node). The app never claims a WhatsApp message was sent;
   it records the message in the Outbox.

Flow: shopkeeper approves → app POSTs `{actionId, type, to, title, message, callbackUrl}`
with `x-kirana-signature` (HMAC-SHA256 of the body) → n8n verifies → n8n POSTs
`callbackUrl` with `x-n8n-callback-secret` → the app marks the action EXECUTED once.
Without `N8N_WEBHOOK_URL`, the app's built-in outbox executes approved actions directly.
