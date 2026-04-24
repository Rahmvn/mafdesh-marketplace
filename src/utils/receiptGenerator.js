import { supabase } from '../supabaseClient';
import { getOrderItemsMap } from './orderItems';

function formatCurrency(value) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getReceiptNote(order) {
  if (order?.status === 'PAID_ESCROW') {
    return 'Payment held in escrow.';
  }

  if (order?.status === 'COMPLETED') {
    return 'Order completed - payment released to seller.';
  }

  if (order?.status === 'REFUNDED') {
    return 'Order refunded.';
  }

  return 'Payment recorded on Mafdesh.';
}

function getOrderTransactionId(order) {
  return (
    order?.transaction_id ||
    order?.payment_reference ||
    order?.metadata?.transaction_id ||
    order?.metadata?.reference ||
    order?.order_number ||
    order?.id
  );
}

function getOrderPaymentMethod(order) {
  return (
    order?.payment_method ||
    order?.metadata?.payment_method ||
    order?.metadata?.channel ||
    'Escrow payment'
  );
}

function getPartyName(user, profile, fallback) {
  return (
    user?.business_name ||
    profile?.full_name ||
    profile?.username ||
    user?.email ||
    fallback
  );
}

function buildReceiptHtml({
  order,
  items,
  sellerUser,
  sellerProfile,
  buyerUser,
  buyerProfile,
}) {
  const sellerName = getPartyName(sellerUser, sellerProfile, 'Seller');
  const buyerName = getPartyName(buyerUser, buyerProfile, 'Buyer');
  const transactionId = getOrderTransactionId(order);
  const paymentMethod = getOrderPaymentMethod(order);
  const receiptId = `MFD-${String(order?.order_number || order?.id || 'ORDER')
    .replace(/[^a-z0-9-]/gi, '')
    .toUpperCase()}`;
  const itemRows = items
    .map((item) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.price_at_time || 0);
      const subtotal = quantity * unitPrice;

      return `
        <tr>
          <td>${escapeHtml(item.product?.name || 'Product')}</td>
          <td>${quantity}</td>
          <td>${formatCurrency(unitPrice)}</td>
          <td>${formatCurrency(subtotal)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Mafdesh Receipt ${escapeHtml(receiptId)}</title>
        <style>
          :root {
            color-scheme: light;
          }
          body {
            margin: 0;
            background: #f8fafc;
            color: #0f172a;
            font-family: Arial, sans-serif;
          }
          .page {
            max-width: 920px;
            margin: 0 auto;
            padding: 24px;
          }
          .actions {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 16px;
          }
          .print-button {
            border: none;
            border-radius: 999px;
            padding: 12px 20px;
            background: #ea580c;
            color: white;
            font-weight: 700;
            cursor: pointer;
          }
          .receipt {
            overflow: hidden;
            border: 1px solid #e2e8f0;
            border-radius: 28px;
            background: white;
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
          }
          .header {
            padding: 28px 32px;
            background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 60%, #f97316 100%);
            color: white;
          }
          .header h1 {
            margin: 0 0 8px;
            font-size: 30px;
          }
          .header p {
            margin: 0;
            color: rgba(255, 255, 255, 0.88);
          }
          .body {
            padding: 32px;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
          }
          .card {
            border: 1px solid #e2e8f0;
            border-radius: 18px;
            padding: 16px;
            background: #f8fafc;
          }
          .label {
            margin-bottom: 8px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: #64748b;
          }
          .value {
            font-size: 18px;
            font-weight: 700;
          }
          .sub-value {
            margin-top: 6px;
            font-size: 14px;
            color: #475569;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 28px;
          }
          th,
          td {
            padding: 12px 0;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
            vertical-align: top;
          }
          th:last-child,
          td:last-child {
            text-align: right;
          }
          .summary {
            margin-top: 20px;
            margin-left: auto;
            max-width: 360px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            padding: 10px 0;
            border-bottom: 1px solid #e2e8f0;
          }
          .summary-row.total {
            font-weight: 800;
            color: #ea580c;
          }
          .note {
            margin-top: 28px;
            border-radius: 18px;
            background: #eff6ff;
            padding: 16px;
            color: #1d4ed8;
          }
          .footer {
            margin-top: 24px;
            font-size: 13px;
            color: #64748b;
          }
          @media print {
            body {
              background: white;
            }
            .page {
              padding: 0;
            }
            .actions {
              display: none;
            }
            .receipt {
              border: none;
              box-shadow: none;
            }
          }
          @media (max-width: 640px) {
            .page,
            .body {
              padding: 16px;
            }
            .meta-grid {
              grid-template-columns: 1fr;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="actions">
            <button class="print-button" onclick="window.print()">Print receipt</button>
          </div>
          <section class="receipt">
            <header class="header">
              <h1>Mafdesh payment receipt</h1>
              <p>Receipt ID: ${escapeHtml(receiptId)}</p>
            </header>
            <div class="body">
              <div class="meta-grid">
                <div class="card">
                  <div class="label">Seller</div>
                  <div class="value">${escapeHtml(sellerName)}</div>
                  <div class="sub-value">
                    ${escapeHtml(sellerUser?.email || sellerProfile?.email || 'No email on file')}
                  </div>
                  ${
                    sellerUser?.phone_number
                      ? `<div class="sub-value">${escapeHtml(sellerUser.phone_number)}</div>`
                      : ''
                  }
                </div>
                <div class="card">
                  <div class="label">Buyer</div>
                  <div class="value">${escapeHtml(buyerName)}</div>
                  <div class="sub-value">${escapeHtml(buyerUser?.email || 'No email on file')}</div>
                </div>
                <div class="card">
                  <div class="label">Order details</div>
                  <div class="value">Order ${escapeHtml(order?.order_number || order?.id || 'Unknown')}</div>
                  <div class="sub-value">Date: ${escapeHtml(formatDateTime(order?.created_at))}</div>
                </div>
                <div class="card">
                  <div class="label">Transaction</div>
                  <div class="value">${escapeHtml(transactionId || 'Not available')}</div>
                  <div class="sub-value">Payment method: ${escapeHtml(paymentMethod)}</div>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows || '<tr><td colspan="4">No order items found.</td></tr>'}
                </tbody>
              </table>

              <div class="summary">
                <div class="summary-row">
                  <span>Delivery fee</span>
                  <strong>${formatCurrency(order?.delivery_fee || 0)}</strong>
                </div>
                <div class="summary-row">
                  <span>Platform fee</span>
                  <strong>${formatCurrency(order?.platform_fee || 0)}</strong>
                </div>
                <div class="summary-row total">
                  <span>Total paid</span>
                  <strong>${formatCurrency(order?.total_amount || 0)}</strong>
                </div>
              </div>

              <div class="note">
                ${escapeHtml(getReceiptNote(order))}
              </div>

              <div class="footer">
                This receipt was generated from your Mafdesh marketplace account and can be saved as PDF from the print dialog.
              </div>
            </div>
          </section>
        </div>
      </body>
    </html>
  `;
}

function buildLoadingHtml() {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Mafdesh Receipt</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f8fafc;
            color: #0f172a;
            font-family: Arial, sans-serif;
          }
          .card {
            width: min(28rem, calc(100vw - 2rem));
            border: 1px solid #e2e8f0;
            border-radius: 24px;
            background: white;
            padding: 28px;
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
            text-align: center;
          }
          .spinner {
            width: 42px;
            height: 42px;
            margin: 0 auto 16px;
            border-radius: 999px;
            border: 4px solid #fed7aa;
            border-top-color: #ea580c;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          h1 {
            margin: 0 0 8px;
            font-size: 22px;
          }
          p {
            margin: 0;
            color: #64748b;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <section class="card">
          <div class="spinner"></div>
          <h1>Preparing your receipt</h1>
          <p>Please wait while Mafdesh loads your order details.</p>
        </section>
      </body>
    </html>
  `;
}

function buildErrorHtml(message) {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Mafdesh Receipt Error</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fff7ed;
            color: #7c2d12;
            font-family: Arial, sans-serif;
            padding: 16px;
          }
          .card {
            width: min(32rem, calc(100vw - 2rem));
            border: 1px solid #fed7aa;
            border-radius: 24px;
            background: white;
            padding: 28px;
            box-shadow: 0 18px 48px rgba(124, 45, 18, 0.08);
          }
          h1 {
            margin: 0 0 10px;
            font-size: 22px;
          }
          p {
            margin: 0;
            color: #9a3412;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <section class="card">
          <h1>We couldn’t generate this receipt</h1>
          <p>${escapeHtml(message || 'Please close this window and try again.')}</p>
        </section>
      </body>
    </html>
  `;
}

function writeReceiptWindow(receiptWindow, html) {
  if (!receiptWindow || receiptWindow.closed) {
    throw new Error('Receipt window is no longer available. Please try again.');
  }

  receiptWindow.document.open();
  receiptWindow.document.write(html);
  receiptWindow.document.close();
  receiptWindow.focus?.();
}

export function openReceiptWindow() {
  const receiptWindow = window.open('about:blank', '_blank', 'width=960,height=780');

  if (!receiptWindow) {
    return null;
  }

  writeReceiptWindow(receiptWindow, buildLoadingHtml());

  return receiptWindow;
}

export async function generateReceipt(orderId, receiptWindow = null) {
  const activeWindow = receiptWindow || openReceiptWindow();

  if (!activeWindow) {
    throw new Error('Your browser blocked the receipt window. Please allow pop-ups and try again.');
  }

  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw orderError || new Error('Order not found.');
    }

    const itemsMap = await getOrderItemsMap([order]);
    const items = itemsMap[order.id] || [];

    const [
      { data: sellerUser },
      { data: sellerProfile },
      { data: buyerUser },
      { data: buyerProfile },
    ] = await Promise.all([
      supabase
        .from('users')
        .select('id, business_name, email, phone_number')
        .eq('id', order.seller_id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, full_name, username')
        .eq('id', order.seller_id)
        .maybeSingle(),
      supabase
        .from('users')
        .select('id, email')
        .eq('id', order.buyer_id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, full_name, username')
        .eq('id', order.buyer_id)
        .maybeSingle(),
    ]);

    writeReceiptWindow(
      activeWindow,
      buildReceiptHtml({
        order,
        items,
        sellerUser,
        sellerProfile,
        buyerUser,
        buyerProfile,
      })
    );
  } catch (error) {
    try {
      writeReceiptWindow(
        activeWindow,
        buildErrorHtml(error?.message || 'Please close this window and try again.')
      );
    } catch (writeError) {
      console.error('Receipt error view failed:', writeError);
    }
    throw error;
  }

  return true;
}
