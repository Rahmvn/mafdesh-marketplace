# Marketplace System

This document explains how the current marketplace works in the app today. It is written for the internal team, so it follows the implemented flow first.

## Overview

### Roles

- `Buyer`: browses products, places orders, confirms receipt, reviews products, or opens disputes.
- `Seller`: receives paid orders, fulfills them within the active deadline, and gets payout after completion or dispute resolution.
- `Admin`: monitors orders and disputes, reviews evidence and dispute history, resolves disputes, and records audit actions.

### Core Order Statuses

- `PENDING`: order has been created but payment confirmation has not finished.
- `PAID_ESCROW`: payment is secured and held by the platform while the seller fulfills the order.
- `SHIPPED`: seller has shipped a delivery order.
- `READY_FOR_PICKUP`: seller has prepared a pickup order and the buyer can collect it.
- `DELIVERED`: seller marked a delivery order as delivered; the buyer can now confirm or dispute.
- `COMPLETED`: order finished successfully and seller payout can be released.
- `DISPUTED`: buyer reported a problem and admin review is required.
- `REFUNDED`: buyer was refunded, either automatically or through admin resolution.
- `CANCELLED`: order was cancelled by admin resolution.

### Escrow Note

Marketplace payments are treated as escrowed funds. Payment is secured before the seller fulfills the order, and money is only released when the order is completed or an admin decides the outcome.

## Order Lifecycle

```text
PENDING -> PAID_ESCROW -> SHIPPED / READY_FOR_PICKUP -> DELIVERED -> COMPLETED

Alternate endings:
- DISPUTED
- REFUNDED
- CANCELLED
```

## Buyer Flow

1. The buyer browses approved, in-stock products in the marketplace.
2. The buyer can order a single product directly or add multiple products to cart.
3. During checkout, the app creates one order per seller. Each order starts as `PENDING`.
4. The order stores delivery or pickup details, order number, delivery fee, platform fee, and total amount.
5. Payment confirmation runs through the backend order-confirm function. That flow checks stock and moves the order into the paid escrow stage.
6. The buyer tracks progress from the order pages:
   - `PAID_ESCROW`: seller is preparing the order.
   - `SHIPPED`: delivery is on the way.
   - `READY_FOR_PICKUP`: buyer should inspect before confirming pickup.
   - `DELIVERED`: buyer should confirm receipt or report a problem.
7. If the order is successful:
   - delivery flow ends when the buyer confirms delivery, or the dispute window expires
   - pickup flow ends when the buyer confirms pickup
8. After completion, the buyer can leave product reviews.
9. If there is a problem, the buyer can open a dispute from the order details flow and attach image evidence.

## Seller Flow

1. The seller sees non-pending orders in the seller order workspace.
2. Once an order is in `PAID_ESCROW`, the seller must act before the fulfillment deadline.
3. The seller can:
   - mark delivery orders as `SHIPPED`
   - mark pickup orders as `READY_FOR_PICKUP`
4. For delivery orders, the seller later marks the order as `DELIVERED`. That starts the buyer dispute window.
5. For pickup orders, the seller waits for the buyer to inspect and confirm pickup.
6. If the buyer confirms successfully, or if the delivery dispute window expires without a dispute, the order reaches `COMPLETED`.
7. Seller earnings are based on:
   - item subtotal
   - plus delivery fee
   - minus platform fee
8. Seller payout changes if the order is refunded or cancelled:
   - `COMPLETED`: seller receives full net earnings
   - `REFUNDED` with full refund: seller receives `0`
   - `REFUNDED` with partial refund: seller payout is reduced by the refund amount
   - `CANCELLED`: seller receives `0`

## Product Archive Rules

Seller archive is a seller-controlled pause for a listing. It hides the product from buyers but keeps order history, product snapshots, reviews, and audit history intact.

A seller can archive only their own product, and only when the product has no active orders, no active flash sale, no purchase within the recent-purchase protection window, and no pending product edit review. Sellers cannot hard-delete products or directly update `deleted_at`; archive and unarchive must go through the database RPCs.

Admin archive is a moderation removal. If `deleted_by_admin_id` or `deletion_reason` is set, the seller cannot archive, unarchive, or otherwise restore the listing. Only admin moderation can restore an admin-archived product.

## Pickup Location Rules

Seller pickup locations use standardized location parts. State and LGA must be selected from platform-controlled options; sellers cannot type arbitrary LGA names. Required pickup fields are exact address, state, LGA, city or town, and particular area or neighbourhood. Display name, nearby landmark, and pickup instructions are optional.

The database also enforces standard state/LGA pairs for new or edited pickup locations so client-side bypasses cannot create free-form LGA values.

## Admin Flow

1. Admin monitors platform activity from admin orders, disputes, users, support, and audit views.
2. When an order becomes `DISPUTED`, it appears in the admin dispute queue.
3. Admin opens the order details page to review:
   - buyer and seller details
   - order items and amounts
   - dispute reason
   - uploaded evidence
   - buyer dispute history
   - seller dispute history
4. Admin resolves the case by choosing one outcome:
   - full refund
   - partial refund
   - release escrow to seller
   - cancel order
5. Admin also records the constitution section and a required reason for accountability.
6. The resolution updates the order record and writes an immutable admin audit entry.

## Payment Logic

1. Checkout creates the order first in `PENDING`.
2. The backend confirmation flow then:
   - verifies the buyer is allowed to confirm the order
   - checks stock using database RPC logic
   - deducts stock if the order can proceed
   - sets the seller fulfillment deadline
3. After successful confirmation, the order is treated as `PAID_ESCROW`.
4. The app uses a `5%` platform fee when creating marketplace orders.
5. For multi-seller cart checkout:
   - the cart is split into separate orders by seller
   - each seller order has its own delivery fee allocation and platform fee
6. Seller payout is calculated from the order data, not just from the displayed total:
   - base payout = item subtotal or product price + delivery fee - platform fee
   - refunds reduce or remove seller payout depending on resolution
7. Seller payout history is shown separately in the seller payments workspace.

## Dispute System

1. Buyers can open disputes from the buyer order details flow when the issue action is available.
2. The implemented dispute entry points are:
   - delivery orders after the order reaches `DELIVERED`
   - pickup orders before the buyer confirms pickup, if there is a problem during collection
3. When a dispute is submitted:
   - the order moves to `DISPUTED`
   - the dispute reason is stored on the order
   - evidence images can be uploaded to dispute storage
   - a dispute message is created
4. Once the order is `DISPUTED`, the in-app dispute thread becomes available.
5. The dispute thread supports follow-up messages and image evidence. It is currently the main in-app conversation channel related to disputes.
6. Admin resolves the dispute with one of four outcomes:
   - `full_refund`
   - `partial_refund`
   - `release`
   - `cancelled`
7. Resolution can also set:
   - `dispute_status`
   - `resolution_type`
   - `resolution_amount`
   - constitution reference and notes

## Timers and Rules

- `ship_deadline`: seller gets 48 hours after payment confirmation to ship or prepare the order.
- `delivery_deadline`: delivery orders get 7 days after the seller marks them shipped to be marked delivered.
- `auto_cancel_at`: pickup orders get a 48-hour pickup window after the seller marks them ready.
- `dispute_deadline`: delivery orders get a 72-hour buyer review/dispute window after the seller marks them delivered.
- Automatic backend processing currently handles:
  - refunding `PAID_ESCROW` orders when the seller misses the fulfillment deadline
  - refunding `READY_FOR_PICKUP` orders when the buyer does not collect in time
  - refunding `SHIPPED` orders when delivery is not completed before the delivery deadline
  - auto-completing `DELIVERED` orders when the dispute window expires without action

## Known Implementation Notes

- This document follows the implemented app flow first, especially the buyer, seller, admin, and Supabase function behavior.
- Some older policy or constitution copy mentions `72 hours` for seller shipping or pickup handling, but the active order flow in code uses `48 hours` for seller fulfillment and pickup expiry.
- The dispute discussion only appears after an order becomes `DISPUTED`. There is no general buyer-seller chat flow outside disputes.
- Operational fields that matter to this workflow include `ship_deadline`, `delivery_deadline`, `auto_cancel_at`, `dispute_deadline`, `dispute_reason`, `dispute_status`, `resolution_type`, and `resolution_amount`.
