import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_EMAIL_DOMAIN = 'example.com';
const DEFAULT_STEP_SPACING_MS = 1000;
const NON_PROD_ENV_NAMES = new Set(['local', 'development', 'dev', 'test', 'testing', 'staging', 'qa']);
const PROD_CONFIRMATION_VALUE = 'YES_I_REALLY_MEAN_IT';
const SAFE_NETWORK_RETRY_DELAYS_MS = [500, 1500, 3000];
let operationQueue = Promise.resolve();

function parseArgs(argv) {
  const parsed = {
    cleanupRunId: '',
    emailDomain: DEFAULT_EMAIL_DOMAIN,
    stepSpacingMs: DEFAULT_STEP_SPACING_MS,
    runId: '',
    allowProduction: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--allow-production') {
      parsed.allowProduction = true;
      continue;
    }

    if (arg === '--cleanup-run-id') {
      parsed.cleanupRunId = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }

    if (arg === '--email-domain') {
      parsed.emailDomain = String(argv[index + 1] || DEFAULT_EMAIL_DOMAIN).trim() || DEFAULT_EMAIL_DOMAIN;
      index += 1;
      continue;
    }

    if (arg === '--step-spacing-ms') {
      parsed.stepSpacingMs = Number(argv[index + 1] || DEFAULT_STEP_SPACING_MS);
      index += 1;
      continue;
    }

    if (arg === '--run-id') {
      parsed.runId = String(argv[index + 1] || '').trim().toLowerCase();
      index += 1;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`
Mafdesh adversarial Edge Function test

Usage:
  node scripts/edge-functions-adversarial-test.mjs
  node scripts/edge-functions-adversarial-test.mjs --step-spacing-ms 1000
  node scripts/edge-functions-adversarial-test.mjs --cleanup-run-id <runId>

Required environment variables:
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  MAFDESH_SUPABASE_ENV=local|development|test|staging|qa

What it tests:
  - create-checkout-order malformed payload rejection
  - get-order-counterparty access and request validation
  - confirm-order request validation and ownership checks
  - finalize-multi-seller-checkout malformed payload rejection
  - admin-moderation-action non-admin and malformed admin payload rejection
  - admin-approve-bank-change non-admin and malformed payload rejection
  - process-order-deadlines request validation and participant/admin authorization

Safety:
  - Refuses to run unless MAFDESH_SUPABASE_ENV is non-production.
  - Seeds only a tiny buyer/seller/admin dataset and cleans by run id.
  - Uses service role only in this backend script for setup, verification, and cleanup.
  - Never put SUPABASE_SERVICE_ROLE_KEY in frontend code.
`);
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeEnvironmentName(value) {
  return String(value || '').trim().toLowerCase();
}

function assertSafeEnvironment({ allowProduction }) {
  const envName = normalizeEnvironmentName(process.env.MAFDESH_SUPABASE_ENV || process.env.SUPABASE_ENV);

  if (!envName) {
    throw new Error(
      'MAFDESH_SUPABASE_ENV is required. Set it to local, development, test, or staging. The script refuses to guess.'
    );
  }

  if (NON_PROD_ENV_NAMES.has(envName)) {
    return envName;
  }

  const hasExplicitProdConfirmation =
    allowProduction && process.env.MAFDESH_ALLOW_PRODUCTION_STRESS_TEST === PROD_CONFIRMATION_VALUE;

  if (!hasExplicitProdConfirmation) {
    throw new Error(
      `Refusing to run against "${envName}". Production runs require --allow-production and MAFDESH_ALLOW_PRODUCTION_STRESS_TEST=${PROD_CONFIRMATION_VALUE}.`
    );
  }

  return envName;
}

function createRunId() {
  return `edgefx${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function sanitizeValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getErrorMessage(error) {
  return String(error?.message || error || '').trim();
}

function isRetryableNetworkError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('fetch failed') ||
    message.includes('network request failed') ||
    message.includes('socketerror') ||
    message.includes('other side closed')
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function executeWithNetworkRetries(operation) {
  for (let attempt = 0; attempt <= SAFE_NETWORK_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableNetworkError(error) || attempt === SAFE_NETWORK_RETRY_DELAYS_MS.length) {
        throw error;
      }

      await delay(SAFE_NETWORK_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new Error('Network retry loop exhausted unexpectedly.');
}

function createAnonClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function createAdminClient(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function enqueueOperation(operation, spacingMs) {
  const queuedOperation = operationQueue
    .catch(() => undefined)
    .then(async () => {
      const result = await operation();
      if (spacingMs > 0) {
        await delay(spacingMs);
      }
      return result;
    });

  operationQueue = queuedOperation.catch(() => undefined);
  return queuedOperation;
}

function buildSeedMetadata({ role, runId, label }) {
  const suffix = sanitizeValue(runId).slice(-8) || 'seed';
  const prefix = sanitizeValue(label).replace(/-/g, '_') || role;
  const seller = role === 'seller';
  return {
    role,
    full_name: seller ? `${label} Seller` : `${label} Buyer`,
    username: `${prefix}_${suffix}`,
    phone_number: seller ? '08012345678' : '08087654321',
    date_of_birth: '1998-04-10',
    business_name: seller ? `${label} Store` : null,
    location: seller ? 'Kaduna' : 'Lagos',
    university_id: null,
    university_name: seller ? 'Mafdesh Seller University' : 'Mafdesh Buyer University',
    university_state: seller ? 'Kaduna' : 'Lagos',
    university_zone: seller ? 'North West' : 'South West',
  };
}

function buildSeedSpecs(runId, emailDomain) {
  const normalizedRunId = sanitizeValue(runId);
  return {
    buyer: {
      role: 'buyer',
      email: `edge-buyer.${normalizedRunId}@${emailDomain}`,
      password: 'Mafdesh!EdgeBuyer1',
      metadata: buildSeedMetadata({ role: 'buyer', runId, label: 'Edge Buyer' }),
    },
    seller: {
      role: 'seller',
      email: `edge-seller.${normalizedRunId}@${emailDomain}`,
      password: 'Mafdesh!EdgeSeller1',
      metadata: buildSeedMetadata({ role: 'seller', runId, label: 'Edge Seller' }),
    },
    intruder: {
      role: 'buyer',
      email: `edge-intruder.${normalizedRunId}@${emailDomain}`,
      password: 'Mafdesh!EdgeIntruder1',
      metadata: buildSeedMetadata({ role: 'buyer', runId, label: 'Edge Intruder' }),
    },
    admin: {
      role: 'buyer',
      email: `edge-admin.${normalizedRunId}@${emailDomain}`,
      password: 'Mafdesh!EdgeAdmin1',
      metadata: buildSeedMetadata({ role: 'buyer', runId, label: 'Edge Admin' }),
    },
  };
}

async function detectProfilesTable(adminClient) {
  const { error } = await adminClient.from('profiles').select('id').limit(1);

  if (!error) {
    return true;
  }

  const normalizedMessage = String(error.message || '').toLowerCase();
  if (normalizedMessage.includes('relation') && normalizedMessage.includes('profiles') && normalizedMessage.includes('does not exist')) {
    return false;
  }

  throw error;
}

async function waitForRecord({ label, operation, retries = 12, delayMs = 500 }) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const value = await operation();
    if (value) {
      return value;
    }

    if (attempt < retries) {
      await delay(delayMs);
    }
  }

  throw new Error(`Timed out waiting for ${label}.`);
}

async function listAuthUsersByExactEmail(adminClient, email) {
  const targetEmail = String(email || '').trim().toLowerCase();
  const matchedUsers = [];
  const pageSize = 200;
  let page = 1;

  while (true) {
    const { data, error } = await executeWithNetworkRetries(() =>
      adminClient.auth.admin.listUsers({
        page,
        perPage: pageSize,
      })
    );

    if (error) {
      throw error;
    }

    const users = data?.users || [];
    users.forEach((user) => {
      if (String(user.email || '').trim().toLowerCase() === targetEmail) {
        matchedUsers.push(user);
      }
    });

    if (users.length < pageSize) {
      break;
    }

    page += 1;
  }

  return matchedUsers;
}

async function listAuthUsersByRunId(adminClient, runId) {
  const needle = sanitizeValue(runId);
  const matchedUsers = [];
  const pageSize = 200;
  let page = 1;

  while (true) {
    const { data, error } = await executeWithNetworkRetries(() =>
      adminClient.auth.admin.listUsers({
        page,
        perPage: pageSize,
      })
    );

    if (error) {
      throw error;
    }

    const users = data?.users || [];
    users.forEach((user) => {
      if (String(user.email || '').toLowerCase().includes(needle)) {
        matchedUsers.push(user);
      }
    });

    if (users.length < pageSize) {
      break;
    }

    page += 1;
  }

  return matchedUsers;
}

async function runBestEffortQuery(operation) {
  try {
    await operation;
  } catch {
    return;
  }
}

async function deleteRunArtifacts(adminClient, userIds) {
  const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];
  if (uniqueUserIds.length === 0) {
    return { failedAuthDeleteIds: [] };
  }
  const failedAuthDeleteIds = [];

  const productIds = [];
  const orderIds = [];
  const cartIds = [];

  const productLookup = await adminClient
    .from('products')
    .select('id')
    .in('seller_id', uniqueUserIds);
  if (!productLookup.error) {
    productIds.push(...(productLookup.data || []).map((row) => row.id).filter(Boolean));
  }

  const buyerOrders = await adminClient
    .from('orders')
    .select('id')
    .in('buyer_id', uniqueUserIds);
  if (!buyerOrders.error) {
    orderIds.push(...(buyerOrders.data || []).map((row) => row.id).filter(Boolean));
  }

  const sellerOrders = await adminClient
    .from('orders')
    .select('id')
    .in('seller_id', uniqueUserIds);
  if (!sellerOrders.error) {
    orderIds.push(...(sellerOrders.data || []).map((row) => row.id).filter(Boolean));
  }

  const cartsLookup = await adminClient
    .from('carts')
    .select('id')
    .in('user_id', uniqueUserIds);
  if (!cartsLookup.error) {
    cartIds.push(...(cartsLookup.data || []).map((row) => row.id).filter(Boolean));
  }

  const uniqueProductIds = [...new Set(productIds)];
  const uniqueOrderIds = [...new Set(orderIds)];
  const uniqueCartIds = [...new Set(cartIds)];

  if (uniqueCartIds.length > 0) {
    await runBestEffortQuery(adminClient.from('cart_items').delete().in('cart_id', uniqueCartIds));
    await runBestEffortQuery(adminClient.from('carts').delete().in('id', uniqueCartIds));
  }

  if (uniqueOrderIds.length > 0) {
    await runBestEffortQuery(adminClient.from('dispute_messages').delete().in('order_id', uniqueOrderIds));
    await runBestEffortQuery(adminClient.from('refund_requests').delete().in('order_id', uniqueOrderIds));
    await runBestEffortQuery(adminClient.from('order_admin_holds').delete().in('order_id', uniqueOrderIds));
    await runBestEffortQuery(adminClient.from('order_items').delete().in('order_id', uniqueOrderIds));
    await runBestEffortQuery(adminClient.from('reviews').delete().in('order_id', uniqueOrderIds));
    await runBestEffortQuery(adminClient.from('orders').delete().in('id', uniqueOrderIds));
  }

  if (uniqueProductIds.length > 0) {
    await runBestEffortQuery(
      adminClient
        .from('product_edit_requests')
        .delete()
        .in('product_id', uniqueProductIds)
    );
    await runBestEffortQuery(adminClient.from('products').delete().in('id', uniqueProductIds));
  }

  await runBestEffortQuery(adminClient.from('saved_addresses').delete().in('buyer_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('seller_delivery_zones').delete().in('seller_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('seller_pickup_locations').delete().in('seller_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('seller_fulfillment_settings').delete().in('seller_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('seller_verifications').delete().in('seller_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('product_edit_requests').delete().in('seller_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('refund_requests').delete().in('buyer_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('refund_requests').delete().in('seller_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('order_admin_holds').delete().in('buyer_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('order_admin_holds').delete().in('seller_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('dispute_messages').delete().in('sender_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('support_tickets').delete().in('resolved_by', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('support_tickets').delete().in('user_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('notifications').delete().in('user_id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('admin_actions').delete().in('admin_id', uniqueUserIds));

  const adminActionsByTarget = [...uniqueUserIds, ...uniqueProductIds, ...uniqueOrderIds];
  if (adminActionsByTarget.length > 0) {
    await runBestEffortQuery(adminClient.from('admin_actions').delete().in('target_id', adminActionsByTarget));
  }

  await runBestEffortQuery(adminClient.from('profiles').delete().in('id', uniqueUserIds));
  await runBestEffortQuery(adminClient.from('users').delete().in('id', uniqueUserIds));

  for (const userId of uniqueUserIds) {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) {
      console.log(`[WARN] Failed to delete auth user ${userId}: ${error.message}`);
      failedAuthDeleteIds.push(userId);
    }
  }

  return { failedAuthDeleteIds };
}

async function ensureSeedUser({ adminClient, profilesEnabled, spec }) {
  const existingUsers = await listAuthUsersByExactEmail(adminClient, spec.email);
  for (const existingUser of existingUsers) {
    await deleteRunArtifacts(adminClient, [existingUser.id]);
  }

  const signupClient = createAnonClient(spec.supabaseUrl, spec.supabaseAnonKey);
  const { data, error } = await executeWithNetworkRetries(() =>
    signupClient.auth.signUp({
      email: spec.email,
      password: spec.password,
      options: {
        data: spec.metadata,
      },
    })
  );

  if (error) {
    throw error;
  }

  const userId =
    String(data?.user?.id || data?.session?.user?.id || '').trim() ||
    String((await waitForRecord({
      label: `auth.users for ${spec.email}`,
      operation: async () => {
        const matchedUsers = await listAuthUsersByExactEmail(adminClient, spec.email);
        return matchedUsers[0]?.id || null;
      },
    })) || '').trim();

  if (!userId) {
    throw new Error(`Seed user creation for ${spec.email} returned no auth user id.`);
  }

  await waitForRecord({
    label: `public.users for ${spec.email}`,
    operation: async () => {
      const result = await adminClient
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      return result.data || null;
    },
  });

  if (profilesEnabled) {
    await waitForRecord({
      label: `public.profiles for ${spec.email}`,
      operation: async () => {
        const result = await adminClient
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (result.error) {
          throw result.error;
        }

        return result.data || null;
      },
    });
  }

  return {
    userId,
    ...spec,
  };
}

async function createAuthenticatedContext({ supabaseUrl, supabaseAnonKey, email, password }) {
  const client = createAnonClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await executeWithNetworkRetries(() =>
    client.auth.signInWithPassword({
      email,
      password,
    })
  );

  if (error) {
    throw error;
  }

  const accessToken = String(data?.session?.access_token || '').trim();
  const userId = String(data?.user?.id || data?.session?.user?.id || '').trim();

  if (!accessToken || !userId) {
    throw new Error('Authentication returned no access token or user id.');
  }

  return { client, accessToken, userId };
}

async function invokeEdgeFunction({ supabaseUrl, functionName, accessToken, body }) {
  const response = await executeWithNetworkRetries(() =>
    fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body ?? {}),
    })
  );

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    bodyText: text,
    bodyJson: json,
  };
}

async function createSeedProduct(adminClient, sellerId, runId) {
  const now = new Date().toISOString();
  const payload = {
    seller_id: sellerId,
    name: `Edge Product ${sanitizeValue(runId).slice(-6)}`,
    category: 'Electronics',
    price: 5000,
    original_price: null,
    description: 'A safe seeded product description for Edge Function adversarial testing.',
    images: ['https://example.com/edge-product.jpg'],
    stock_quantity: 10,
    is_approved: true,
    delivery_enabled: true,
    pickup_mode: 'disabled',
    pickup_locations: [],
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await adminClient.from('products').insert(payload).select('*').single();
  if (error) {
    throw error;
  }

  return data;
}

async function createPendingProductEditRequest(adminClient, { product, sellerId }) {
  const submittedAt = new Date().toISOString();
  const payload = {
    product_id: product.id,
    seller_id: sellerId,
    status: 'pending',
    current_snapshot: {
      name: product.name,
      price: product.price,
      category: product.category,
      description: product.description,
      images: product.images,
    },
    proposed_snapshot: {
      name: '  Updated\u200B Edge Product  ',
      price: product.price,
      category: '  Electronics  ',
      description: ' Updated\u00A0description \n\n with extra spacing. ',
      images: [' https://example.com/updated-edge-product.jpg ', ''],
    },
    admin_reason: null,
    submitted_at: submittedAt,
    reviewed_at: null,
    reviewed_by: null,
  };

  const { data, error } = await adminClient
    .from('product_edit_requests')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function setPendingBankChange(adminClient, sellerId) {
  const pending = {
    bank_name: '  Test Bank  ',
    account_number: ' 0011 2233 44 ',
    account_name: '  Seller Name  ',
    business_address: '  12 Example Street, Lagos  ',
    bvn: ' 123 456 789 01 ',
    tax_id: '  TAX-001  ',
  };

  const { error } = await adminClient
    .from('users')
    .update({
      bank_details_pending: pending,
      bank_details_approved: false,
    })
    .eq('id', sellerId);

  if (error) {
    throw error;
  }
}

function buildCases(context) {
  return [
    {
      id: 'control_create_checkout_order_valid_pickup',
      expected: 'should_accept',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'create-checkout-order',
          accessToken: context.auth.buyer.accessToken,
          body: {
            productId: context.product.id,
            deliveryType: 'pickup',
            deliveryFee: 0,
            selectedPickupLocation: 'Main Gate',
            pickupLocationSnapshot: { label: 'Main Gate', address_text: 'Campus Main Gate' },
            checkout_reference: `ref-${context.runId}`,
            items: [{ product_id: context.product.id, quantity: 1 }],
          },
        });

        if (!result.ok || !result.bodyJson?.order?.id) {
          return {
            pass: false,
            note: `Expected successful checkout order creation, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
          };
        }

        context.orderId = result.bodyJson.order.id;
        return {
          pass: true,
          note: `Checkout order created successfully. orderId=${context.orderId}`,
        };
      },
    },
    {
      id: 'reject_create_checkout_order_invalid_delivery_type',
      expected: 'should_reject',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'create-checkout-order',
          accessToken: context.auth.buyer.accessToken,
          body: {
            productId: context.product.id,
            deliveryType: 'drone-drop',
            deliveryFee: 0,
            items: [{ product_id: context.product.id, quantity: 1 }],
          },
        });

        const rejected = result.status === 400 && String(result.bodyJson?.error || '').toLowerCase().includes('delivery type');
        return {
          pass: rejected,
          note: rejected
            ? 'Invalid deliveryType was rejected before order creation.'
            : `Expected 400 invalid delivery type, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'reject_create_checkout_order_multi_item_payload',
      expected: 'should_reject',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'create-checkout-order',
          accessToken: context.auth.buyer.accessToken,
          body: {
            productId: context.product.id,
            deliveryType: 'pickup',
            deliveryFee: 0,
            selectedPickupLocation: 'Main Gate',
            items: [
              { product_id: context.product.id, quantity: 1 },
              { product_id: context.product.id, quantity: 1 },
            ],
          },
        });

        const rejected = result.status === 400 && String(result.bodyJson?.error || '').toLowerCase().includes('single-order checkout');
        return {
          pass: rejected,
          note: rejected
            ? 'Multi-item single-order payload was rejected cleanly.'
            : `Expected single-order payload rejection, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'reject_create_checkout_order_mismatched_item_product',
      expected: 'should_reject',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'create-checkout-order',
          accessToken: context.auth.buyer.accessToken,
          body: {
            productId: context.product.id,
            deliveryType: 'pickup',
            deliveryFee: 0,
            selectedPickupLocation: 'Main Gate',
            items: [{ product_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
          },
        });

        const rejected = result.status === 400 && String(result.bodyJson?.error || '').toLowerCase().includes('payload is invalid');
        return {
          pass: rejected,
          note: rejected
            ? 'Mismatched single-order item payload was rejected cleanly.'
            : `Expected invalid payload rejection, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'control_get_order_counterparty_valid',
      expected: 'should_accept',
      run: async () => {
        if (!context.orderId) {
          return { pass: false, note: 'No seeded order id was available from the checkout control case.' };
        }

        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'get-order-counterparty',
          accessToken: context.auth.buyer.accessToken,
          body: { orderId: context.orderId },
        });

        const pass =
          result.ok &&
          result.bodyJson?.success === true &&
          result.bodyJson?.counterparty?.role === 'seller';

        return {
          pass,
          note: pass
            ? 'Counterparty lookup succeeded and resolved seller context correctly.'
            : `Expected counterparty lookup success, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'reject_get_order_counterparty_missing_order_id',
      expected: 'should_reject',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'get-order-counterparty',
          accessToken: context.auth.buyer.accessToken,
          body: {},
        });

        const rejected = result.status === 400 && String(result.bodyJson?.error || '').toLowerCase().includes('missing orderid');
        return {
          pass: rejected,
          note: rejected
            ? 'Missing orderId was rejected cleanly.'
            : `Expected missing orderId rejection, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'reject_confirm_order_missing_order_id',
      expected: 'should_reject',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'confirm-order',
          accessToken: context.auth.buyer.accessToken,
          body: {},
        });

        const rejected = result.status === 400 && String(result.bodyJson?.error || '').toLowerCase().includes('missing orderid');
        return {
          pass: rejected,
          note: rejected
            ? 'Missing orderId was rejected by confirm-order.'
            : `Expected missing orderId rejection, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'reject_confirm_order_forbidden_intruder',
      expected: 'should_reject',
      run: async () => {
        if (!context.orderId) {
          return { pass: false, note: 'No seeded order id was available from the checkout control case.' };
        }

        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'confirm-order',
          accessToken: context.auth.intruder.accessToken,
          body: {
            orderId: context.orderId,
            mockPayment: true,
            paymentReference: `intruder-${context.runId}`,
          },
        });

        const rejected = result.status === 403;
        return {
          pass: rejected,
          note: rejected
            ? 'Non-owner order confirmation was rejected.'
            : `Expected forbidden response, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'reject_finalize_multi_missing_orders',
      expected: 'should_reject',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'finalize-multi-seller-checkout',
          accessToken: context.auth.buyer.accessToken,
          body: {
            checkoutSessionId: `checkout-${context.runId}`,
            paymentReference: `payment-${context.runId}`,
            expectedAmountKobo: 10000,
            mockPayment: true,
          },
        });

        const rejected = result.status === 400 && String(result.bodyJson?.error || '').toLowerCase().includes('orders must be a non-empty array');
        return {
          pass: rejected,
          note: rejected
            ? 'Missing multi-seller orders array was rejected cleanly.'
            : `Expected orders-array rejection, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'reject_finalize_multi_duplicate_seller_groups',
      expected: 'should_reject',
      run: async () => {
        const price = Number(context.product.price || 5000);
        const deliveryFee = 1000;
        const subtotal = price;
        const total = subtotal + deliveryFee;
        const platformFee = Math.round(subtotal * 0.05);
        const payload = {
          checkoutSessionId: `checkout-dup-${context.runId}`,
          paymentReference: `payment-dup-${context.runId}`,
          expectedAmountKobo: total * 200,
          mockPayment: true,
          orders: [
            {
              seller_id: context.seedUsers.seller.userId,
              subtotal,
              discount_amount: 0,
              delivery_fee: deliveryFee,
              total,
              platform_fee: platformFee,
              items: [{ product_id: context.product.id, quantity: 1, price_at_time: price }],
            },
            {
              seller_id: context.seedUsers.seller.userId,
              subtotal,
              discount_amount: 0,
              delivery_fee: deliveryFee,
              total,
              platform_fee: platformFee,
              items: [{ product_id: context.product.id, quantity: 1, price_at_time: price }],
            },
          ],
        };

        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'finalize-multi-seller-checkout',
          accessToken: context.auth.buyer.accessToken,
          body: payload,
        });

        const rejected =
          result.status === 409 &&
          String(result.bodyJson?.error || '').toLowerCase().includes('each seller can only appear once');
        return {
          pass: rejected,
          note: rejected
            ? 'Duplicate seller groups were rejected by secure multi-seller checkout validation.'
            : `Expected duplicate seller rejection, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'reject_admin_moderation_action_non_admin',
      expected: 'should_reject',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'admin-moderation-action',
          accessToken: context.auth.seller.accessToken,
          body: {
            actionType: 'SUSPEND_USER',
            targetId: context.seedUsers.buyer.userId,
            reason: 'Nope',
          },
        });

        return {
          pass: result.status === 403,
          note: result.status === 403
            ? 'Non-admin moderation request was rejected.'
            : `Expected 403 for non-admin moderation, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'reject_admin_moderation_action_missing_reason',
      expected: 'should_reject',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'admin-moderation-action',
          accessToken: context.auth.admin.accessToken,
          body: {
            actionType: 'SUSPEND_USER',
            targetId: context.seedUsers.intruder.userId,
            reason: '   ',
          },
        });

        const rejected = result.status === 400 && String(result.bodyJson?.error || '').toLowerCase().includes('reason is required');
        return {
          pass: rejected,
          note: rejected
            ? 'Empty admin moderation reason was rejected cleanly.'
            : `Expected empty-reason rejection, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'control_admin_moderation_action_approve_product_edit',
      expected: 'should_accept',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'admin-moderation-action',
          accessToken: context.auth.admin.accessToken,
          body: {
            actionType: 'APPROVE_PRODUCT_EDIT',
            targetId: context.product.id,
            reason: '  Approved\u200B   after review  ',
            context: {
              requestId: context.productEditRequest.id,
            },
          },
        });

        if (!result.ok || result.bodyJson?.success !== true) {
          return {
            pass: false,
            note: `Expected product-edit approval success, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
          };
        }

        const { data: updatedProduct, error } = await context.adminClient
          .from('products')
          .select('name, category, description, images')
          .eq('id', context.product.id)
          .single();

        if (error) {
          return { pass: false, note: `Failed to verify approved product edit: ${error.message}` };
        }

        const pass =
          updatedProduct.name === 'Updated Edge Product' &&
          updatedProduct.category === 'Electronics' &&
          String(updatedProduct.description || '').includes('Updated description') &&
          Array.isArray(updatedProduct.images) &&
          updatedProduct.images.length === 1;

        return {
          pass,
          note: pass
            ? 'Admin-approved product edit was applied through sanitized server-side fields.'
            : `Approved product edit did not normalize as expected: ${JSON.stringify(updatedProduct)}`,
        };
      },
    },
    {
      id: 'reject_admin_approve_bank_change_non_admin',
      expected: 'should_reject',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'admin-approve-bank-change',
          accessToken: context.auth.seller.accessToken,
          body: {
            sellerId: context.seedUsers.seller.userId,
            decision: 'approve',
            reason: 'Trying this as seller',
          },
        });

        return {
          pass: result.status === 403,
          note: result.status === 403
            ? 'Non-admin bank-change review was rejected.'
            : `Expected 403 for non-admin bank review, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'reject_admin_approve_bank_change_invalid_decision',
      expected: 'should_reject',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'admin-approve-bank-change',
          accessToken: context.auth.admin.accessToken,
          body: {
            sellerId: context.seedUsers.seller.userId,
            decision: 'drop-table',
            reason: 'Nope',
          },
        });

        const rejected = result.status === 400 && String(result.bodyJson?.error || '').toLowerCase().includes('invalid request fields');
        return {
          pass: rejected,
          note: rejected
            ? 'Invalid bank-change decision was rejected cleanly.'
            : `Expected invalid-decision rejection, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'control_admin_approve_bank_change_valid',
      expected: 'should_accept',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'admin-approve-bank-change',
          accessToken: context.auth.admin.accessToken,
          body: {
            sellerId: context.seedUsers.seller.userId,
            decision: 'approve',
            reason: '  Approved\u200B bank details  ',
          },
        });

        if (!result.ok || result.bodyJson?.success !== true) {
          return {
            pass: false,
            note: `Expected bank-change approval success, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
          };
        }

        const { data: updatedSeller, error } = await context.adminClient
          .from('users')
          .select('bank_details_pending, bank_details_approved, account_number, bvn')
          .eq('id', context.seedUsers.seller.userId)
          .single();

        if (error) {
          return { pass: false, note: `Failed to verify bank approval result: ${error.message}` };
        }

        const pass =
          updatedSeller.bank_details_pending == null &&
          updatedSeller.bank_details_approved === true &&
          updatedSeller.account_number === '0011223344' &&
          updatedSeller.bvn === '12345678901';

        return {
          pass,
          note: pass
            ? 'Admin-approved bank change stored sanitized digits and cleared the pending request.'
            : `Approved bank details did not normalize as expected: ${JSON.stringify(updatedSeller)}`,
        };
      },
    },
    {
      id: 'reject_process_order_deadlines_missing_order_id',
      expected: 'should_reject',
      run: async () => {
        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'process-order-deadlines',
          accessToken: context.auth.buyer.accessToken,
          body: {},
        });

        const rejected = result.status === 400 && String(result.bodyJson?.error || '').toLowerCase().includes('missing orderid');
        return {
          pass: rejected,
          note: rejected
            ? 'Missing orderId was rejected by process-order-deadlines.'
            : `Expected missing orderId rejection, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
    {
      id: 'reject_process_order_deadlines_forbidden_intruder',
      expected: 'should_reject',
      run: async () => {
        if (!context.orderId) {
          return { pass: false, note: 'No seeded order id was available from the checkout control case.' };
        }

        const result = await invokeEdgeFunction({
          supabaseUrl: context.supabaseUrl,
          functionName: 'process-order-deadlines',
          accessToken: context.auth.intruder.accessToken,
          body: {
            orderId: context.orderId,
          },
        });

        return {
          pass: result.status === 403,
          note: result.status === 403
            ? 'Non-participant deadline processing request was rejected.'
            : `Expected 403 for non-participant deadline processing, got ${result.status}: ${result.bodyJson?.error || result.bodyText}`,
        };
      },
    },
  ];
}

async function writeReport({ runId, environmentName, results }) {
  const reportsDir = path.resolve(__dirname, '..', 'tmp');
  await fs.mkdir(reportsDir, { recursive: true });
  const outputFile = path.join(reportsDir, `edge-functions-adversarial-test-${runId}.json`);
  await fs.writeFile(
    outputFile,
    `${JSON.stringify({ runId, environmentName, createdAt: new Date().toISOString(), results }, null, 2)}\n`,
    'utf8'
  );
  return outputFile;
}

function printSummary({ runId, results, outputFile }) {
  const passed = results.filter((result) => result.status === 'pass').length;
  const warnings = results.filter((result) => result.status === 'warn').length;
  const failed = results.filter((result) => result.status === 'fail').length;
  const groupedFindings = results.reduce((map, result) => {
    const key = `${result.status}: ${result.note}`;
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());

  console.log('\n=== Mafdesh Edge Function Adversarial Summary ===');
  console.log(`Run ID: ${runId}`);
  console.log(`Total cases: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Warnings: ${warnings}`);
  console.log(`Failures: ${failed}`);
  console.log('Grouped findings:');

  for (const [finding, count] of groupedFindings.entries()) {
    console.log(`- ${count}x ${finding}`);
  }

  console.log(`Detailed report: ${outputFile}`);
  console.log('\nCleanup:');
  console.log(`- node scripts/edge-functions-adversarial-test.mjs --cleanup-run-id ${runId}`);
  console.log('- Keep SUPABASE_SERVICE_ROLE_KEY in backend-only env files or terminal env vars.');
}

async function cleanupRun({ adminClient, cleanupRunId }) {
  const matchedUsers = await listAuthUsersByRunId(adminClient, cleanupRunId);

  if (!matchedUsers.length) {
    console.log(`No auth users found for run id "${cleanupRunId}".`);
    return;
  }

  console.log(`Found ${matchedUsers.length} auth users for cleanup run id "${cleanupRunId}".`);
  const { failedAuthDeleteIds } = await deleteRunArtifacts(adminClient, matchedUsers.map((user) => user.id));
  const failedAuthDeleteIdSet = new Set(failedAuthDeleteIds);

  matchedUsers
    .map((user) => ({
      email: String(user.email || '').trim(),
      id: String(user.id || '').trim(),
    }))
    .sort((left, right) => left.email.localeCompare(right.email))
    .forEach(({ email, id }) => {
      if (failedAuthDeleteIdSet.has(id)) {
        console.log(`[PARTIAL] ${email} | auth user still exists`);
        return;
      }

      console.log(`[CLEANED] ${email}`);
    });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const environmentName = assertSafeEnvironment({ allowProduction: args.allowProduction });
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const adminClient = createAdminClient(supabaseUrl, serviceRoleKey);

  if (args.cleanupRunId) {
    await cleanupRun({ adminClient, cleanupRunId: args.cleanupRunId });
    return;
  }

  const runId = sanitizeValue(args.runId || createRunId());
  const profilesEnabled = await detectProfilesTable(adminClient);
  const seedSpecs = buildSeedSpecs(runId, args.emailDomain);

  console.log(`Starting Mafdesh adversarial Edge Function test in ${environmentName}.`);
  const seedUsers = {
    buyer: await ensureSeedUser({
      adminClient,
      profilesEnabled,
      spec: { ...seedSpecs.buyer, supabaseUrl, supabaseAnonKey },
    }),
    seller: await ensureSeedUser({
      adminClient,
      profilesEnabled,
      spec: { ...seedSpecs.seller, supabaseUrl, supabaseAnonKey },
    }),
    intruder: await ensureSeedUser({
      adminClient,
      profilesEnabled,
      spec: { ...seedSpecs.intruder, supabaseUrl, supabaseAnonKey },
    }),
    admin: await ensureSeedUser({
      adminClient,
      profilesEnabled,
      spec: { ...seedSpecs.admin, supabaseUrl, supabaseAnonKey },
    }),
  };

  await adminClient
    .from('users')
    .update({
      role: 'admin',
      phone_number: '08011112222',
    })
    .eq('id', seedUsers.admin.userId);

  await adminClient
    .from('users')
    .update({
      role: 'seller',
      business_name: 'Edge Seller Store',
      seller_agreement_accepted: true,
      seller_agreement_accepted_at: new Date().toISOString(),
      seller_agreement_version: 'edge-test-v1',
    })
    .eq('id', seedUsers.seller.userId);

  const product = await createSeedProduct(adminClient, seedUsers.seller.userId, runId);
  const productEditRequest = await createPendingProductEditRequest(adminClient, {
    product,
    sellerId: seedUsers.seller.userId,
  });
  await setPendingBankChange(adminClient, seedUsers.seller.userId);

  const auth = {
    buyer: await createAuthenticatedContext({
      supabaseUrl,
      supabaseAnonKey,
      email: seedUsers.buyer.email,
      password: seedUsers.buyer.password,
    }),
    seller: await createAuthenticatedContext({
      supabaseUrl,
      supabaseAnonKey,
      email: seedUsers.seller.email,
      password: seedUsers.seller.password,
    }),
    intruder: await createAuthenticatedContext({
      supabaseUrl,
      supabaseAnonKey,
      email: seedUsers.intruder.email,
      password: seedUsers.intruder.password,
    }),
    admin: await createAuthenticatedContext({
      supabaseUrl,
      supabaseAnonKey,
      email: seedUsers.admin.email,
      password: seedUsers.admin.password,
    }),
  };

  const context = {
    runId,
    supabaseUrl,
    adminClient,
    product,
    productEditRequest,
    seedUsers,
    auth,
    orderId: '',
  };

  const cases = buildCases(context);
  console.log(`Run ID: ${runId}`);
  console.log(`Cases: ${cases.length}`);
  console.log(`Step spacing (ms): ${args.stepSpacingMs}`);
  console.log(`Profiles table enabled: ${profilesEnabled ? 'yes' : 'no'}`);
  const results = [];

  for (const testCase of cases) {
    const result = await enqueueOperation(async () => {
      try {
        const outcome = await testCase.run();
        return {
          id: testCase.id,
          expected: testCase.expected,
          status: outcome.pass ? 'pass' : 'fail',
          note: outcome.note,
        };
      } catch (error) {
        return {
          id: testCase.id,
          expected: testCase.expected,
          status: 'fail',
          note: `Unhandled error: ${getErrorMessage(error)}`,
        };
      }
    }, args.stepSpacingMs);

    results.push(result);
    console.log(
      `[${result.status.toUpperCase()}] ${result.id} | expected=${result.expected} | note=${result.note}`
    );
  }

  const outputFile = await writeReport({ runId, environmentName, results });
  printSummary({ runId, results, outputFile });
}

main().catch((error) => {
  console.error(getErrorMessage(error));
  process.exitCode = 1;
});
