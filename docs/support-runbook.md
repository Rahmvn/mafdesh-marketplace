# Mafdesh Support Runbook

## Expired timer but stale status

- Open the relevant order list or details page first; visible overdue orders should trigger catch-up processing automatically.
- If the status stays stale, confirm whether the order has an active admin hold or pending refund request.
- Check `process-order-deadlines` logs to see whether the order was processed, skipped as not due, or blocked.

## Buyer cannot complete checkout

- Confirm the buyer is still authenticated and the session has not expired.
- For single checkout, verify the order was created and the payment page loaded with the correct pending order.
- For multi-seller checkout, capture the checkout reference or payment reference shown to the buyer and inspect the finalization function logs.

## Seller or admin role mismatch

- Confirm the user can authenticate normally.
- Check the `public.users` row and verify the stored role matches the intended account type.
- If local storage looks stale, sign out and back in; route guards should still resolve from the database role.

## Paid but not finalized

- Treat the provider reference or checkout reference as the primary investigation key.
- Check whether the payment verification step succeeded and whether order creation failed after verification.
- If finalization did not complete, preserve the reference and reconcile before asking the buyer to retry payment.
