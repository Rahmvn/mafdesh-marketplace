import { supabase } from '../supabaseClient';
import { getOrderItemsMap } from './orderItems';
import { getBuyerOrderAmounts } from './orderAmounts';
import { fetchPublicSellerDirectory } from '../services/publicSellerService';
import landscapeLogo from '../../mafdesh-img/landscape-logo-removebg-preview.png';

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

async function getOrderCounterparty(orderId) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    return null;
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-order-counterparty`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ orderId }),
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => ({}));
  return payload?.counterparty || null;
}

function getLandscapeLogoMarkup(logoSrc) {
  if (logoSrc) {
    return `
      <img
        src="${escapeHtml(logoSrc)}"
        alt="Mafdesh"
        class="brand-logo"
      />
    `;
  }

  return `
    <svg width="180" height="40" viewBox="0 0 180 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mafdesh logo">
      <rect width="180" height="40" rx="8" fill="transparent" />
      <circle cx="20" cy="20" r="14" fill="#f97316" />
      <text x="17" y="25" fill="#fff" font-weight="700" font-size="12">H</text>
      <text x="44" y="26" fill="#1e40af" font-weight="800" font-size="18">Mafdesh</text>
    </svg>
  `;
}

function buildReceiptHtml({
  order,
  items,
  sellerUser,
  sellerProfile,
  buyerUser,
  buyerProfile,
  logoSrc,
}) {
  const sellerName = getPartyName(sellerUser, sellerProfile, 'Seller');
  const buyerName = getPartyName(buyerUser, buyerProfile, 'Buyer');
  const transactionId = getOrderTransactionId(order);
  const paymentMethod = getOrderPaymentMethod(order);
  const orderAmounts = getBuyerOrderAmounts(order, items);
  const receiptId = `MFD-${String(order?.order_number || order?.id || 'ORDER')
    .replace(/[^a-z0-9-]/gi, '')
    .toUpperCase()}`;
  const orderReference = escapeHtml(order?.order_number || order?.id || 'Unknown');
  const receiptStatus = escapeHtml(String(order?.status || 'PAID').replaceAll('_', ' '));
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
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            background: #eef3f8;
            color: #172033;
            font-family: "Segoe UI", Arial, sans-serif;
          }
          .page {
            max-width: 980px;
            margin: 0 auto;
            padding: 32px 24px 48px;
          }
          .actions {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 18px;
          }
          .print-button {
            border: none;
            border-radius: 999px;
            padding: 12px 22px;
            background: linear-gradient(135deg, #ea580c, #f97316);
            color: white;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 10px 24px rgba(234, 88, 12, 0.24);
          }
          .receipt {
            overflow: hidden;
            border: 1px solid #d7e0ea;
            border-radius: 26px;
            background: white;
            box-shadow: 0 22px 60px rgba(15, 23, 42, 0.1);
          }
          .header {
            padding: 28px 32px 24px;
            background:
              radial-gradient(circle at top right, rgba(249, 115, 22, 0.18), transparent 28%),
              linear-gradient(135deg, #f8fbff 0%, #eef5ff 55%, #fff7ed 100%);
            border-bottom: 1px solid #dbe7f3;
          }
          .brand-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 20px;
            flex-wrap: wrap;
          }
          .brand-block {
            display: flex;
            flex-direction: column;
            gap: 14px;
            flex: 1 1 420px;
            min-width: 0;
          }
          .brand-logo {
            display: block;
            width: 220px;
            max-width: 100%;
            height: auto;
            object-fit: contain;
          }
          .brand-copy {
            max-width: min(420px, 100%);
            min-width: 0;
          }
          .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            padding: 6px 12px;
            border-radius: 999px;
            background: #fff;
            border: 1px solid #dbe7f3;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #36506f;
          }
          .header h1 {
            margin: 0 0 10px;
            font-size: 32px;
            line-height: 1.1;
            color: #0f172a;
          }
          .header p {
            margin: 0;
            color: #52627a;
            line-height: 1.6;
          }
          .header-meta {
            width: min(100%, 280px);
            min-width: min(250px, 100%);
            border: 1px solid #dbe7f3;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.92);
            padding: 18px;
          }
          .meta-label {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #64748b;
          }
          .meta-value {
            margin-top: 6px;
            font-size: 15px;
            font-weight: 700;
            color: #0f172a;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .status-pill {
            display: inline-flex;
            align-items: center;
            margin-top: 14px;
            padding: 8px 12px;
            border-radius: 999px;
            background: #dbeafe;
            color: #1d4ed8;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }
          .body {
            padding: 32px;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px;
          }
          .card {
            border: 1px solid #dbe7f3;
            border-radius: 18px;
            padding: 18px;
            background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
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
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .sub-value {
            margin-top: 6px;
            font-size: 14px;
            color: #475569;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .section-title {
            margin: 32px 0 14px;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #64748b;
          }
          .table-shell {
            overflow-x: auto;
            border: 1px solid #dbe7f3;
            border-radius: 18px;
            background: #fff;
          }
          table {
            width: 100%;
            min-width: 560px;
            border-collapse: collapse;
            margin-top: 0;
          }
          thead {
            background: #f8fafc;
          }
          th {
            padding: 14px 16px;
            border-bottom: 1px solid #dbe7f3;
            text-align: left;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #64748b;
          }
          td {
            padding: 16px;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
            vertical-align: top;
          }
          th:last-child,
          td:last-child {
            text-align: right;
          }
          tbody tr:last-child td {
            border-bottom: none;
          }
          td:first-child {
            min-width: 200px;
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .summary {
            margin-top: 28px;
            margin-left: auto;
            width: min(100%, 380px);
            border: 1px solid #dbe7f3;
            border-radius: 20px;
            background: #fbfdff;
            padding: 8px 18px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            padding: 14px 0;
            border-bottom: 1px solid #dbe7f3;
          }
          .summary-row.total {
            font-weight: 800;
            color: #ea580c;
            font-size: 16px;
          }
          .note {
            margin-top: 28px;
            border-radius: 18px;
            background: linear-gradient(135deg, #eff6ff 0%, #fff7ed 100%);
            padding: 18px;
            color: #1e3a8a;
            border: 1px solid #dbeafe;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .footer {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            font-size: 13px;
            color: #64748b;
          }
          .footer strong {
            color: #0f172a;
          }
          .footer > div {
            min-width: 0;
            overflow-wrap: anywhere;
            word-break: break-word;
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
            .page {
              padding: 16px;
            }
            .header,
            .body {
              padding: 18px;
            }
            .brand-row,
            .footer {
              flex-direction: column;
            }
            .header-meta {
              width: 100%;
              min-width: 0;
            }
            .meta-grid {
              grid-template-columns: 1fr;
            }
            th,
            td {
              padding-left: 12px;
              padding-right: 12px;
            }
            .summary {
              width: 100%;
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
              <div class="brand-row">
                <div class="brand-block">
                  ${getLandscapeLogoMarkup(logoSrc)}
                  <div class="brand-copy">
                    <div class="eyebrow">Marketplace Receipt</div>
                    <h1>Official payment receipt</h1>
                    <p>This receipt confirms payment received for a Mafdesh marketplace order and is suitable for printing or saving as PDF.</p>
                  </div>
                </div>
                <div class="header-meta">
                  <div class="meta-label">Receipt ID</div>
                  <div class="meta-value">${escapeHtml(receiptId)}</div>
                  <div class="meta-label" style="margin-top: 14px;">Order Reference</div>
                  <div class="meta-value">${orderReference}</div>
                  <div class="status-pill">${receiptStatus}</div>
                </div>
              </div>
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

              <div class="section-title">Purchased Items</div>
              <div class="table-shell">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Unit price</th>
                      <th>Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemRows || '<tr><td colspan="4">No order items found.</td></tr>'}
                  </tbody>
                </table>
              </div>

              <div class="summary">
              <div class="summary-row">
                <span>Total products price</span>
                <strong>${formatCurrency(orderAmounts.subtotal)}</strong>
              </div>
              <div class="summary-row">
                <span>Delivery fee</span>
                <strong>${formatCurrency(orderAmounts.deliveryFee)}</strong>
              </div>
              <div class="summary-row total">
                <span>Total paid</span>
                <strong>${formatCurrency(orderAmounts.total)}</strong>
              </div>
              </div>

              <div class="note">
                ${escapeHtml(getReceiptNote(order))}
              </div>

              <div class="footer">
                <div>This receipt was generated from your Mafdesh marketplace account and can be saved as PDF from the print dialog.</div>
                <div><strong>Mafdesh</strong><br />Marketplace payments and escrow records</div>
              </div>
            </div>
          </section>
        </div>
      </body>
    </html>
  `;
}

async function getReceiptLogoSrc() {
  try {
    const response = await fetch(landscapeLogo)

    if (!response.ok) {
      throw new Error('Logo request failed.')
    }

    const logoBlob = await response.blob()

    return await new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onloadend = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Logo conversion failed.'))
      reader.readAsDataURL(logoBlob)
    })
  } catch (error) {
    console.error('Receipt logo embedding failed:', error)

    try {
      return new URL(landscapeLogo, window.location.origin).href
    } catch {
      return landscapeLogo
    }
  }
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
    const logoSrc = await getReceiptLogoSrc();

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
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const currentUserId = session?.user?.id || null;
    const isBuyerView = currentUserId === order.buyer_id;
    const isSellerView = currentUserId === order.seller_id;
    const counterparty = currentUserId ? await getOrderCounterparty(order.id) : null;
    const sellerDirectory = await fetchPublicSellerDirectory([order.seller_id]);
    const publicSeller = sellerDirectory[String(order.seller_id)] || null;

    const [
      { data: currentUser },
      { data: currentProfile },
    ] = await Promise.all([
      supabase
        .from('users')
        .select('id, business_name, email, phone_number')
        .eq('id', currentUserId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, full_name, username')
        .eq('id', currentUserId)
        .maybeSingle(),
    ]);

    const sellerUser = isSellerView
      ? currentUser
      : {
          id: order.seller_id,
          business_name: publicSeller?.business_name || '',
          email: counterparty?.role === 'seller' ? counterparty.email || '' : '',
          phone_number:
            counterparty?.role === 'seller' ? counterparty.phoneNumber || '' : '',
        };
    const sellerProfile = isSellerView
      ? currentProfile
      : publicSeller?.profiles || null;
    const buyerUser = isBuyerView
      ? currentUser
      : {
          id: order.buyer_id,
          email: counterparty?.role === 'buyer' ? counterparty.email || '' : '',
        };
    const buyerProfile = isBuyerView
      ? currentProfile
      : {
          id: order.buyer_id,
          full_name: counterparty?.role === 'buyer' ? counterparty.fullName || '' : '',
          username: counterparty?.role === 'buyer' ? counterparty.username || '' : '',
        };

    writeReceiptWindow(
      activeWindow,
      buildReceiptHtml({
        order,
        items,
        sellerUser,
        sellerProfile,
        buyerUser,
        buyerProfile,
        logoSrc,
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
