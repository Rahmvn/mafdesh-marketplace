# Mafdesh Launch Checklist

Use this sheet before calling Mafdesh launch-ready. Mark each item `Yes` only after verifying it in the deployed environment.

## Buyer

- `Yes / No` Buyer can sign up successfully
- `Yes / No` Buyer can verify email successfully
- `Yes / No` Buyer can log in successfully
- `Yes / No` Buyer can log out and log back in
- `Yes / No` Guest cart survives until login
- `Yes / No` Guest cart merges correctly after buyer login
- `Yes / No` Buyer can complete single-product checkout
- `Yes / No` Buyer can complete multi-seller checkout
- `Yes / No` Buyer can open orders and order details
- `Yes / No` Buyer sees correct timer and status behavior

## Seller

- `Yes / No` Seller can log in successfully
- `Yes / No` Seller dashboard loads correctly
- `Yes / No` Seller products page works
- `Yes / No` Seller orders page works
- `Yes / No` Seller order details work
- `Yes / No` Seller verification page works
- `Yes / No` Seller payments and payout pages load correctly

## Admin

- `Yes / No` Admin can log in successfully   
- `Yes / No` Admin dashboard loads correctly
- `Yes / No` Admin orders page works
- `Yes / No` Admin order details work
- `Yes / No` Admin disputes page works
- `Yes / No` Admin users page works

## Order Lifecycle

- `Yes / No` New orders enter the correct status
- `Yes / No` Shipping timer uses business days correctly
- `Yes / No` Pickup timer uses business days correctly
- `Yes / No` Expired orders actually change status
- `Yes / No` Client catch-up fixes stale expired orders
- `Yes / No` Held orders do not auto-transition incorrectly
- `Yes / No` Pending refund orders do not auto-transition incorrectly

## Deployment And Supabase

- `Yes / No` Supabase auth config is correct
- `Yes / No` Auth callback URLs are correct
- `Yes / No` Required edge functions are deployed
- `Yes / No` Deadline cron is enabled
- `Yes / No` Required storage buckets exist
- `Yes / No` Production env vars are correct

## Support And Recovery

- `Yes / No` Support form submits successfully
- `Yes / No` Attachment failure does not block support ticket
- `Yes / No` Role mismatch can be investigated and fixed
- `Yes / No` Stale order status can be investigated and fixed
- `Yes / No` Failed checkout can be investigated with references and logs

## Engineering Gate

- `Yes / No` `npm test` passes
- `Yes / No` `npm run build` passes
- `Yes / No` No major console or runtime errors appear in live testing
- `Yes / No` Trusted testers completed end-to-end flows successfully

## Launch Rule

- If any critical item is `No`, do not call the app launch-ready yet.
