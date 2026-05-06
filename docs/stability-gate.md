# Mafdesh Stability Gate

This checklist is the minimum launch gate before any live-money branch is considered ready for broader rollout.

## Release Gate

- `npm run build` passes.
- `npm test` passes with zero failing tests and zero unhandled rejections.
- Buyer, seller, and admin smoke flows pass manually.
- Deadline cron plus in-app catch-up are both verified against overdue test orders.
- Any payment-facing branch keeps demo behavior isolated from `main`.

## Runtime Audit Notes

### Auth and route guards

- Source of truth: `public.users.role` and the authenticated Supabase session.
- Failure points: expired session, failed auth bootstrap invoke, failed `users` read, stale local storage.
- Retry behavior: auth helpers retry transient auth/network failures; route guards fall back to unauthenticated handling.
- User fallback: redirect to login or route to the correct dashboard from the resolved database role.
- Flow ownership: mixed client/server, with database role resolution treated as authoritative.

### Single checkout creation

- Source of truth: `create-checkout-order` edge function.
- Failure points: missing session token, invalid product state, network timeout, edge function rejection.
- Retry behavior: auth session lookup retries; request timeout fails fast and lets the buyer retry.
- User fallback: checkout surfaces the real backend error instead of silently mutating state.
- Flow ownership: mixed client/server, with order creation server-owned.

### Multi-seller checkout finalization

- Source of truth: `finalize-multi-seller-checkout` edge function.
- Failure points: checkout validation mismatch, seller inactive, payment verification mismatch, order creation failure.
- Retry behavior: function remains idempotent by payment reference; client can retry finalization safely.
- User fallback: preserve the payment reference and support message when finalization does not complete.
- Flow ownership: mixed client/server, with final order creation and payment verification server-owned.

### Order deadline processing

- Source of truth: `process-order-deadlines` edge function.
- Failure points: cron lag, blocked orders under hold/refund review, transient invoke failures.
- Retry behavior: cron is primary; visible list/detail pages run catch-up processing once per deadline key.
- User fallback: UI refresh after successful catch-up, with skipped and failed attempts logged.
- Flow ownership: server-owned transitions with client-triggered recovery.

### Admin moderation and intervention

- Source of truth: admin edge functions and protected admin pages.
- Failure points: stale page state, invalid target status, unauthorized invocation.
- Retry behavior: admin pages reload after successful actions; protected routes re-check session and role.
- User fallback: admin remains on protected pages only when the database role resolves to `admin`.
- Flow ownership: mixed client/server, with status mutation server-owned.

## Manual Smoke Checklist

- Buyer login, logout, and protected-route redirect work after refresh.
- Buyer can create a single checkout order and reach the payment page.
- Multi-seller checkout can finalize or fail cleanly with a preserved support reference.
- Seller dashboard, products, orders, and verification pages load without route or context errors.
- Admin orders and order details can open overdue orders and observe automatic catch-up.
