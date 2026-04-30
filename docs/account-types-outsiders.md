# Account Types for Outsiders

This guide explains the three live account types in Mafdesh today: `buyer`, `seller`, and `admin`.

It is written for public or non-technical readers. If you need the deeper internal explanation of how these roles affect operations, see [Marketplace System](./marketplace-system.md) and the internal companion guide in [account-types-insiders.md](./account-types-insiders.md).

## Quick Overview

Mafdesh has three account types:

- `Buyer`: shops, pays, tracks orders, confirms delivery or pickup, and raises disputes when something goes wrong.
- `Seller`: lists products, manages store operations, fulfills paid orders, manages delivery and pickup setup, and tracks payouts.
- `Admin`: oversees the platform, reviews disputes and support issues, manages approvals, and records important moderation actions.

Only `buyer` and `seller` accounts are created from the public sign-up flow. `Admin` is an internal role, not a public sign-up option.

## Which Account Should You Choose?

- Choose `buyer` if you want to browse products and place orders.
- Choose `seller` if you want to run a store and receive payouts for completed orders.
- Do not choose `admin` unless you are part of the platform team and your access is created internally.

## Buyer Account

### Who it is for

Buyers are customers using Mafdesh to discover products and place orders.

### What a buyer can access

- Marketplace browsing and product detail pages
- Cart and checkout
- Buyer order history
- Buyer payment history
- Address book
- Profile and support

Main buyer pages in the app today:

- `/marketplace`
- `/cart`
- `/orders`
- `/buyer/orders/:id`
- `/buyer/payments`
- `/account/addresses`
- `/profile`
- `/support`

### How a buyer uses Mafdesh

1. Create a buyer account and log in.
2. Browse approved products.
3. Add items to cart or go straight to checkout.
4. Pay for the order.
5. Track seller progress.
6. Confirm delivery or pickup when the order is successful.
7. Open a dispute if there is a problem.

### What a buyer cannot do

- Cannot open seller-only workspaces such as seller products, seller orders, or seller payouts
- Cannot open admin-only workspaces
- Cannot manage another seller's listings or payout details

### How to use a buyer account well

- Keep your delivery addresses up to date in the address book.
- Watch your order status after payment so you can respond quickly.
- Use the dispute flow from the order page if something is wrong.
- Keep your profile, phone number, and email accurate so sellers and support can help faster.

## Seller Account

### Who it is for

Sellers are merchants using Mafdesh to list products, fulfill paid orders, and receive payouts.

### What a seller can access

- Seller dashboard
- Product management
- Seller order queue and order details
- Seller payment and payout history
- Delivery settings and pickup locations
- Verification page
- Profile and support

Main seller pages in the app today:

- `/seller/dashboard`
- `/seller/products`
- `/seller/products/new`
- `/seller/orders`
- `/seller/orders/:id`
- `/seller/payments`
- `/seller/delivery`
- `/seller/verification`
- `/profile`
- `/support`

### How a seller uses Mafdesh

1. Create a seller account and log in.
2. Add products to the store.
3. Set up delivery details and pickup locations.
4. Add payout details in the profile area and wait for admin approval.
5. Receive paid orders in the seller order workspace.
6. Mark orders as shipped or ready for pickup.
7. Mark delivery orders as delivered when the handoff is complete.
8. Track released payouts and held items in seller payments.

### Important seller notes

- Seller verification is a separate trust and premium feature.
- Verification helps buyers recognize the store, but it does not replace good fulfillment behavior.
- Bank or business detail changes are reviewed by admin before they become active.

### What a seller cannot do

- Cannot access buyer-only order, checkout, payment, or address-book routes
- Cannot access admin tools
- Cannot directly approve their own payout-detail changes
- Cannot directly override disputes, refunds, or platform moderation outcomes

### How to use a seller account well

- Keep delivery settings and pickup locations complete before listing heavily.
- Check seller orders often because paid orders have fulfillment deadlines.
- Keep business and bank details accurate so payouts are not delayed.
- Use support early if a dispute, refund issue, or payout problem appears.

## Admin Account

### Who it is for

Admins are internal platform operators. This role is for oversight, moderation, dispute handling, and operational review.

### What an admin can access

- Admin dashboard
- Orders and disputes
- Refund requests
- Product management and approvals
- User management
- Constitution reference
- Bank approvals
- Support inbox
- Audit log

Main admin pages in the app today:

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

### What outsiders should know about admins

- Admins review disputes between buyers and sellers.
- Admins review sensitive updates such as seller bank-detail requests and trust-sensitive product changes.
- Admins can suspend users, verify or unverify sellers, and archive or restore products.
- Important admin actions are recorded for accountability.

### What an admin cannot do

- Admin is not a public sign-up account type.
- Admin is not meant for buying or store-running as a normal user workflow.
- Admin actions are controlled and tracked rather than being casual shortcuts.

## Shared Account Rules

- Everyone logs in through the same login page, but access changes based on account type.
- Profile and support are shared concepts across the product, but each role sees different operational pages.
- Buyers and sellers should not expect a direct chat system outside the dispute flow.
- The app follows the role model that exists in code today: `buyer`, `seller`, and `admin`.

## When You Need More Detail

- For marketplace flow, timing rules, disputes, escrow, payouts, and system behavior, read [Marketplace System](./marketplace-system.md).
- For internal operations and admin-facing role guidance, read [Account Types for Insiders](./account-types-insiders.md).
