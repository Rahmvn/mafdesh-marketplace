# Account Types for Insiders

This guide explains the live Mafdesh account model for internal staff, especially admins, support, and operations readers.

The implemented role model today is:

- `buyer`
- `seller`
- `admin`

For technical lifecycle detail around orders, disputes, escrow, and timers, this document should be read alongside [Marketplace System](./marketplace-system.md).

## Role Model and Access Basics

### Source-of-truth roles

The app is built around three real roles only: `buyer`, `seller`, and `admin`.

### Public account creation

- Public sign-up supports `buyer` and `seller`.
- `admin` is an internal role and is not offered in the public sign-up flow.
- Login enforces role-aware routing after authentication.

### Shared access patterns

- `Profile` and `Support` exist across roles, but their operational meaning differs by role.
- Route protection is role-based across buyer, seller, and admin workspaces.
- Admin-facing actions are expected to be deliberate and auditable.

## Buyer Account

### Purpose

The buyer role is the customer role. It is centered on discovery, checkout, order tracking, confirmation, and disputes.

### Main buyer workspaces

- `/marketplace`
- `/cart`
- `/orders`
- `/buyer/orders/:id`
- `/buyer/payments`
- `/account/addresses`
- `/profile`
- `/support`

### What buyers can do

- Browse approved, in-stock marketplace listings
- Add items to cart and complete checkout
- Track order progress
- Confirm delivery or pickup
- Open disputes from the buyer order flow
- Maintain saved addresses

### What buyers cannot do

- Cannot access seller workspace routes
- Cannot access admin routes
- Cannot self-resolve disputes or override escrow outcomes
- Cannot change seller payout or moderation state

### What changes in the system when a buyer acts

- Checkout creates order records and payment confirmation moves valid orders from `PENDING` to `PAID_ESCROW`.
- Buyer confirmation can move an order to completion.
- Buyer dispute submission moves the order into the dispute path and makes the admin review flow relevant.
- Buyer address management affects checkout convenience, not seller or admin permissions.

### Common admin and support interpretation

- A buyer opening a dispute is not itself a resolution; it is the start of admin review.
- A buyer can be legitimate, mistaken, late, or abusive, so admins should check order history, evidence, deadlines, and dispute history before deciding.
- Buyers are the only users expected to rely on saved addresses and buyer payment history.

## Seller Account

### Purpose

The seller role is the merchant role. It is centered on listings, order fulfillment, delivery configuration, payouts, and trust signals.

### Main seller workspaces

- `/seller/dashboard`
- `/seller/products`
- `/seller/products/new`
- `/seller/products/add/preview`
- `/seller/products/:id/edit`
- `/seller/products/:id/reviews`
- `/seller/orders`
- `/seller/orders/:id`
- `/seller/payments`
- `/seller/delivery`
- `/seller/verification`
- `/seller/agreement`
- `/profile`
- `/support`

### What sellers can do

- Create and manage their own product listings
- Configure fulfillment and pickup settings
- See paid orders in the seller order workspace
- Mark delivery orders as shipped and delivered
- Mark pickup orders as ready for pickup
- View payout history and released amounts
- Submit bank-detail changes for approval
- Subscribe to seller verification

### What sellers cannot do

- Cannot access buyer-only checkout, address-book, or buyer-payment routes
- Cannot access admin routes
- Cannot approve their own bank-detail updates
- Cannot directly resolve disputes, refund decisions, or moderation decisions
- Cannot restore admin-archived listings themselves

### What changes in the system when a seller acts

- Product creation adds listings, but admin approval and moderation state still matter.
- Seller fulfillment actions advance the order lifecycle and start or satisfy timers.
- Marking `SHIPPED`, `READY_FOR_PICKUP`, or `DELIVERED` changes what the buyer sees next and what deadlines apply.
- Bank-detail submissions create a pending-review state that admins must approve or reject.
- Verification purchase and expiry affect the seller trust badge and premium seller experience.

### Common admin and support interpretation

- Sellers are operationally sensitive because their actions affect fulfillment deadlines, buyer confidence, and payouts.
- Missed seller deadlines can lead to automated refunds or admin review windows.
- Seller bank and business details are payout-critical and should be reviewed carefully.
- Seller product changes may require approval, re-approval, rejection, archive, or restore actions depending on trust impact.

## Admin Account

### Purpose

The admin role is the internal operations and governance role. It exists to review, moderate, resolve, approve, and document sensitive platform decisions.

### Main admin workspaces

- `/admin/dashboard`
- `/admin/orders`
- `/admin/order/:id`
- `/admin/disputes`
- `/admin/refund-requests`
- `/admin/products`
- `/admin/users`
- `/admin/users/:id`
- `/admin/constitution`
- `/admin/bank-approvals`
- `/admin/support`
- `/admin/actions`

### What admins can do today

- Review the admin dashboard for platform totals and recent order activity
- Review orders and open order details
- Review open and resolved disputes
- Resolve dispute-related outcomes from admin order details
- Review refund requests
- Manage product approval, unapproval, archive, restore, and sensitive product edit reviews
- Review users, suspend or activate users, and verify or unverify sellers
- Review seller bank-detail change requests
- Triage and update support tickets
- Review audit history

### What admins cannot do

- Admin is not a self-service public role
- Admin should not bypass the platform's guarded action flows for sensitive decisions
- Admin should not treat role-based pages as interchangeable; each route has specific purpose and consequences

### What changes in the system when an admin acts

- User actions:
  - Suspending a user blocks access.
  - Activating a user restores access.
  - Verifying or unverifying a seller changes the marketplace trust signal.
- Product actions:
  - Approving or unapproving changes storefront eligibility.
  - Archiving hides a listing while preserving record history.
  - Restoring reopens an archived record.
  - Approving or rejecting sensitive product edits controls what becomes live.
- Bank approval actions:
  - Approve applies the seller's pending bank/business details.
  - Reject keeps existing active details and clears the pending request.
- Dispute and refund actions:
  - Resolution choices affect order outcome, buyer refund status, and seller payout consequences.
- Audit actions:
  - Important admin actions are recorded for accountability.

## Admin Tools by Operational Job

### 1. Review platform health

Use:

- `Admin Dashboard`
- `Admin Orders`
- `Admin Disputes`

Purpose:

- Check platform volume, dispute load, total buyers, total sellers, and recent operational activity.

### 2. Resolve disputes and order conflicts

Use:

- `Admin Disputes`
- `Admin Order Details`
- `Admin Constitution`

Purpose:

- Review buyer and seller details
- Review evidence and dispute history
- Apply an outcome such as full refund, partial refund, release to seller, or cancellation
- Record constitution section and reasoning

### 3. Moderate products and trust-sensitive edits

Use:

- `Admin Products`

Purpose:

- Approve or unapprove products
- Archive or restore products
- Review pending trust-sensitive change requests before they replace the live listing

### 4. Manage user risk and trust

Use:

- `Admin Users`
- `Admin User Details`

Purpose:

- Filter users by role
- Review dispute counts and account status
- Suspend or activate users
- Verify or unverify sellers

### 5. Review payout-critical seller changes

Use:

- `Admin Bank Approvals`

Purpose:

- Compare active seller bank details with requested changes
- Approve or reject pending payout-detail updates

### 6. Handle internal support workflow

Use:

- `Admin Support`

Purpose:

- Search and triage support tickets
- Move tickets through `open`, `in_progress`, and `resolved`
- Reply using the stored contact context and attachments

### 7. Preserve accountability

Use:

- `Admin Audit Log`

Purpose:

- Review who did what, to which target, and why
- Filter admin actions by admin, action type, target type, and date

## Guardrails and Decision Notes for Admins

- Reason capture matters for privileged actions. Internal docs and UI already treat many admin actions as justification-required.
- Product, user, bank-detail, and trust-related actions are not routine clicks; they change what users can access or trust.
- Dispute decisions should be tied back to evidence, timing, order state, and constitution guidance.
- Seller verification should be treated as a trust signal, not just a cosmetic toggle.
- Pending bank-detail changes are payout-sensitive and should be reviewed with care.
- There is no general in-app buyer-seller chat outside the dispute thread flow.

## Fast Role Comparison

| Role | Main goal | Main workspaces | Sensitive actions |
| --- | --- | --- | --- |
| `buyer` | Shop and complete orders | Marketplace, cart, orders, payments, addresses | Checkout, confirmation, dispute opening |
| `seller` | List products and fulfill orders | Dashboard, products, orders, payments, delivery, verification | Fulfillment updates, payout-detail requests, verification |
| `admin` | Govern platform operations | Dashboard, orders, disputes, products, users, bank approvals, support, audit | Moderation, approvals, suspension, verification, dispute outcomes |

## When to Use the Other Docs

- Use [Marketplace System](./marketplace-system.md) when you need order-state, deadline, payout, dispute, and escrow details.
- Use [Account Types for Outsiders](./account-types-outsiders.md) when you need a simple explanation suitable for public or non-technical readers.
