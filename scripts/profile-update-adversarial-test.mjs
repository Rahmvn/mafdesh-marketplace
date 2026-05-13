import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_EMAIL_DOMAIN = 'example.com';
const DEFAULT_UPDATE_SPACING_MS = 1200;
const NON_PROD_ENV_NAMES = new Set(['local', 'development', 'dev', 'test', 'testing', 'staging', 'qa']);
const PROD_CONFIRMATION_VALUE = 'YES_I_REALLY_MEAN_IT';
const SAFE_NETWORK_RETRY_DELAYS_MS = [500, 1500, 3000];
let updateOperationQueue = Promise.resolve();

function parseArgs(argv) {
  const parsed = {
    cleanupRunId: '',
    emailDomain: DEFAULT_EMAIL_DOMAIN,
    updateSpacingMs: DEFAULT_UPDATE_SPACING_MS,
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

    if (arg === '--update-spacing-ms') {
      parsed.updateSpacingMs = Number(argv[index + 1] || DEFAULT_UPDATE_SPACING_MS);
      index += 1;
      continue;
    }

    if (arg === '--run-id') {
      parsed.runId = String(argv[index + 1] || '').trim().toLowerCase();
      index += 1;
      continue;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`
Mafdesh adversarial profile-update test

Usage:
  node scripts/profile-update-adversarial-test.mjs
  node scripts/profile-update-adversarial-test.mjs --update-spacing-ms 1200
  node scripts/profile-update-adversarial-test.mjs --cleanup-run-id <runId>

Required environment variables:
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  MAFDESH_SUPABASE_ENV=local|development|test|staging|qa

Safety:
  - Refuses to run unless MAFDESH_SUPABASE_ENV is non-production.
  - Seeds only a tiny buyer/seller pair for controlled post-login update checks.
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
  return `profileupdate${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
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

async function enqueueUpdateOperation(operation, spacingMs) {
  const queuedOperation = updateOperationQueue
    .catch(() => undefined)
    .then(async () => {
      const result = await operation();
      if (spacingMs > 0) {
        await delay(spacingMs);
      }
      return result;
    });

  updateOperationQueue = queuedOperation.catch(() => undefined);
  return queuedOperation;
}

function buildSeedMetadata({ role, runId }) {
  const suffix = sanitizeValue(runId).slice(-8) || 'seed';
  const seller = role === 'seller';
  return {
    role,
    full_name: seller ? 'Seller Update Control' : 'Buyer Update Control',
    username: seller ? `seller_update_${suffix}` : `buyer_update_${suffix}`,
    phone_number: seller ? '08012345678' : '08087654321',
    date_of_birth: '1998-04-10',
    business_name: seller ? 'Update Control Store' : null,
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
      email: `update-buyer.${normalizedRunId}@${emailDomain}`,
      password: 'Mafdesh!UpdateBuyer1',
      metadata: buildSeedMetadata({ role: 'buyer', runId }),
    },
    seller: {
      role: 'seller',
      email: `update-seller.${normalizedRunId}@${emailDomain}`,
      password: 'Mafdesh!UpdateSeller1',
      metadata: buildSeedMetadata({ role: 'seller', runId }),
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

async function waitForRecord({ operation, label, maxAttempts = 20, delayMs = 400 }) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const record = await operation();
      if (record) {
        return record;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxAttempts) {
      await delay(delayMs);
    }
  }

  if (lastError) {
    throw new Error(`${label} was not available in time: ${getErrorMessage(lastError)}`);
  }

  throw new Error(`${label} was not available in time.`);
}

async function listAuthUsersByExactEmail(adminClient, email) {
  const targetEmail = String(email || '').trim().toLowerCase();
  const matchedUsers = [];
  let page = 1;
  const pageSize = 200;

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

async function deleteUserArtifacts(adminClient, userId) {
  const profileDelete = await adminClient.from('profiles').delete().eq('id', userId);
  if (profileDelete.error) {
    const message = String(profileDelete.error.message || '').toLowerCase();
    if (!(message.includes('relation') && message.includes('profiles') && message.includes('does not exist'))) {
      throw profileDelete.error;
    }
  }

  const usersDelete = await adminClient.from('users').delete().eq('id', userId);
  if (usersDelete.error) {
    throw usersDelete.error;
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) {
    throw deleteError;
  }
}

async function ensureSeedUser({ adminClient, profilesEnabled, spec }) {
  const existingUsers = await listAuthUsersByExactEmail(adminClient, spec.email);
  for (const existingUser of existingUsers) {
    await deleteUserArtifacts(adminClient, existingUser.id);
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: spec.email,
    password: spec.password,
    email_confirm: true,
    user_metadata: spec.metadata,
  });

  if (error) {
    throw error;
  }

  const userId = data?.user?.id;
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

async function fetchCurrentState(adminClient, userId, profilesEnabled) {
  const userResult = await adminClient
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (userResult.error) {
    throw userResult.error;
  }

  let profile = null;
  if (profilesEnabled) {
    const profileResult = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileResult.error) {
      throw profileResult.error;
    }

    profile = profileResult.data || null;
  }

  return {
    user: userResult.data || null,
    profile,
  };
}

async function createAuthenticatedClient({ supabaseUrl, supabaseAnonKey, email, password }) {
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

  const userId = data?.user?.id || data?.session?.user?.id || '';
  if (!userId) {
    throw new Error('Authenticated update test returned no user id.');
  }

  return {
    client,
    userId,
  };
}

function buildCases() {
  return [
    {
      id: 'buyer_profile_update_allowed',
      actor: 'buyer',
      expectation: 'should_allow',
      target: 'profiles',
      payload: {
        full_name: 'Buyer Updated Name',
        location: 'Ibadan',
      },
      expectedFields: {
        full_name: 'Buyer Updated Name',
        location: 'Ibadan',
      },
    },
    {
      id: 'buyer_phone_update_allowed',
      actor: 'buyer',
      expectation: 'should_allow',
      target: 'users',
      payload: {
        phone_number: '08022223333',
      },
      expectedFields: {
        phone_number: '08022223333',
      },
    },
    {
      id: 'seller_workspace_update_allowed',
      actor: 'seller',
      expectation: 'should_allow',
      target: 'users',
      payload: {
        business_name: 'Updated Seller Store',
        phone_number: '08033334444',
      },
      expectedFields: {
        business_name: 'Updated Seller Store',
        phone_number: '08033334444',
      },
    },
    {
      id: 'seller_agreement_accept_allowed',
      actor: 'seller',
      expectation: 'should_allow',
      target: 'users',
      payload: {
        seller_agreement_accepted: true,
      },
      verify: ({ after }) =>
        after.user?.seller_agreement_accepted === true &&
        Boolean(after.user?.seller_agreement_accepted_at) &&
        Boolean(after.user?.seller_agreement_version),
      verifyMessage: 'Seller agreement acceptance should set accepted=true plus timestamp/version.',
    },
    {
      id: 'buyer_role_admin_tamper_blocked',
      actor: 'buyer',
      expectation: 'should_block',
      target: 'users',
      payload: {
        role: 'admin',
      },
      forbiddenFields: {
        role: 'admin',
      },
    },
    {
      id: 'buyer_verified_seller_tamper_blocked',
      actor: 'buyer',
      expectation: 'should_block',
      target: 'users',
      payload: {
        is_verified_seller: true,
      },
      forbiddenFields: {
        is_verified_seller: true,
      },
    },
    {
      id: 'buyer_trust_metrics_tamper_blocked',
      actor: 'buyer',
      expectation: 'should_block',
      target: 'users',
      payload: {
        is_trusted_seller: true,
        completed_orders: 999,
        average_rating: 5,
        dispute_rate: 0,
        no_fraud_flags: false,
      },
      forbiddenFields: {
        is_trusted_seller: true,
        completed_orders: 999,
        average_rating: 5,
        no_fraud_flags: false,
      },
    },
    {
      id: 'buyer_account_status_tamper_blocked',
      actor: 'buyer',
      expectation: 'should_block',
      target: 'users',
      payload: {
        account_status: 'suspended',
      },
      forbiddenFields: {
        account_status: 'suspended',
      },
    },
    {
      id: 'seller_verification_state_tamper_blocked',
      actor: 'seller',
      expectation: 'should_block',
      target: 'users',
      payload: {
        verification_status: 'approved',
        verification_approved_at: new Date().toISOString(),
      },
      forbiddenFields: {
        verification_status: 'approved',
      },
    },
    {
      id: 'seller_bank_approval_tamper_blocked',
      actor: 'seller',
      expectation: 'should_block',
      target: 'users',
      payload: {
        bank_details_approved: false,
      },
      forbiddenFields: {
        bank_details_approved: false,
      },
    },
    {
      id: 'buyer_seller_agreement_invalid_blocked',
      actor: 'buyer',
      expectation: 'should_block',
      target: 'users',
      payload: {
        seller_agreement_accepted: true,
      },
      forbiddenFields: {
        seller_agreement_accepted: true,
      },
    },
  ];
}

function valuesMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function findChangedForbiddenFields({ beforeRow, afterRow, forbiddenFields }) {
  return Object.entries(forbiddenFields || {}).filter(([field, forbiddenValue]) => {
    return valuesMatch(afterRow?.[field], forbiddenValue) && !valuesMatch(beforeRow?.[field], forbiddenValue);
  });
}

function findMissingExpectedFields({ afterRow, expectedFields }) {
  return Object.entries(expectedFields || {}).filter(([field, expectedValue]) => {
    return !valuesMatch(afterRow?.[field], expectedValue);
  });
}

function classifyCase(caseDefinition, outcome) {
  const { expectation, target, expectedFields, forbiddenFields, verify, verifyMessage } = caseDefinition;
  const { before, after, updateError } = outcome;
  const beforeRow = target === 'profiles' ? before.profile : before.user;
  const afterRow = target === 'profiles' ? after.profile : after.user;

  if (expectation === 'should_allow') {
    if (updateError) {
      return { verdict: 'fail', note: `Expected update to succeed, but got: ${updateError}` };
    }

    if (typeof verify === 'function') {
      if (verify({ before, after })) {
        return { verdict: 'pass', note: 'Allowed update succeeded and post-update invariants look correct.' };
      }

      return { verdict: 'fail', note: verifyMessage || 'Allowed update did not produce the expected final state.' };
    }

    const missingExpectedFields = findMissingExpectedFields({ afterRow, expectedFields });
    if (missingExpectedFields.length === 0) {
      return { verdict: 'pass', note: 'Allowed update succeeded and expected fields changed correctly.' };
    }

    return {
      verdict: 'fail',
      note: `Allowed update finished, but fields did not match expected values: ${missingExpectedFields.map(([field]) => field).join(', ')}`,
    };
  }

  if (expectation === 'should_block') {
    const changedForbiddenFields = findChangedForbiddenFields({ beforeRow, afterRow, forbiddenFields });

    if (changedForbiddenFields.length > 0) {
      return {
        verdict: 'fail',
        note: `Protected fields changed unexpectedly: ${changedForbiddenFields.map(([field]) => field).join(', ')}`,
      };
    }

    if (updateError) {
      return { verdict: 'pass', note: `Protected update was rejected: ${updateError}` };
    }

    return { verdict: 'pass', note: 'Protected update was neutralized and sensitive fields remained unchanged.' };
  }

  return { verdict: 'warn', note: 'Case had no known expectation mapping.' };
}

function printCaseResult(result) {
  const prefix = result.verdict.toUpperCase();
  console.log(
    `[${prefix}] ${result.caseId} | actor=${result.actor} | target=${result.target} | note=${result.note}`
  );
}

function summarizeVerdicts(results) {
  return results.reduce(
    (summary, result) => {
      summary[result.verdict] = (summary[result.verdict] || 0) + 1;
      return summary;
    },
    { pass: 0, warn: 0, fail: 0 }
  );
}

function groupFindings(results) {
  const grouped = new Map();

  results.forEach((result) => {
    const key = `${result.verdict}: ${result.note}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  });

  return [...grouped.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([key, count]) => ({ count, label: key }));
}

async function writeReport({ runId, environmentName, results }) {
  const reportsDir = path.join(__dirname, '..', 'tmp');
  await fs.mkdir(reportsDir, { recursive: true });

  const outputFile = path.join(reportsDir, `profile-update-adversarial-test-${runId}.json`);
  await fs.writeFile(
    outputFile,
    `${JSON.stringify({ runId, environmentName, createdAt: new Date().toISOString(), results }, null, 2)}\n`,
    'utf8'
  );

  return outputFile;
}

function printSummary({ runId, results, outputFile }) {
  const verdicts = summarizeVerdicts(results);
  const groupedFindings = groupFindings(results);

  console.log('\n=== Mafdesh Adversarial Profile Update Summary ===');
  console.log(`Run ID: ${runId}`);
  console.log(`Total cases: ${results.length}`);
  console.log(`Passed: ${verdicts.pass}`);
  console.log(`Warnings: ${verdicts.warn}`);
  console.log(`Failures: ${verdicts.fail}`);
  console.log('Grouped findings:');
  groupedFindings.forEach((entry) => {
    console.log(`- ${entry.count}x ${entry.label}`);
  });
  console.log(`Detailed report: ${outputFile}`);
  console.log('\nCleanup:');
  console.log(`- node scripts/profile-update-adversarial-test.mjs --cleanup-run-id ${runId}`);
  console.log('- Keep SUPABASE_SERVICE_ROLE_KEY in backend-only env files or terminal env vars.');
}

async function cleanupRun({ adminClient, cleanupRunId, emailDomain }) {
  const emailNeedle = `.${sanitizeValue(cleanupRunId)}@${emailDomain}`.toLowerCase();
  const matchedUsers = [];
  let page = 1;
  const pageSize = 200;

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
      if (String(user.email || '').trim().toLowerCase().includes(emailNeedle)) {
        matchedUsers.push(user);
      }
    });

    if (users.length < pageSize) {
      break;
    }

    page += 1;
  }

  if (matchedUsers.length === 0) {
    console.log(`No auth users found for run id "${cleanupRunId}".`);
    return;
  }

  console.log(`Found ${matchedUsers.length} auth users for cleanup run id "${cleanupRunId}".`);

  for (const user of matchedUsers) {
    const email = user.email || '(no email)';
    try {
      await deleteUserArtifacts(adminClient, user.id);
      console.log(`[CLEANED] ${email}`);
    } catch (error) {
      console.log(`[FAILED] Cleanup auth delete for ${email}: ${getErrorMessage(error)}`);
    }
  }
}

async function runCase({
  caseDefinition,
  supabaseUrl,
  supabaseAnonKey,
  adminClient,
  userSpec,
  profilesEnabled,
  updateSpacingMs,
}) {
  const { client, userId } = await createAuthenticatedClient({
    supabaseUrl,
    supabaseAnonKey,
    email: userSpec.email,
    password: userSpec.password,
  });

  const before = await fetchCurrentState(adminClient, userId, profilesEnabled);
  let updateError = '';

  try {
    await enqueueUpdateOperation(async () => {
      if (caseDefinition.target === 'profiles') {
        const response = await client
          .from('profiles')
          .update(caseDefinition.payload)
          .eq('id', userId)
          .select('*')
          .maybeSingle();

        if (response.error) {
          throw response.error;
        }
      } else {
        const response = await client
          .from('users')
          .update(caseDefinition.payload)
          .eq('id', userId)
          .select('*')
          .maybeSingle();

        if (response.error) {
          throw response.error;
        }
      }
    }, updateSpacingMs);
  } catch (error) {
    updateError = getErrorMessage(error);
  }

  const after = await fetchCurrentState(adminClient, userId, profilesEnabled);
  const { verdict, note } = classifyCase(caseDefinition, {
    before,
    after,
    updateError,
  });

  return {
    caseId: caseDefinition.id,
    actor: caseDefinition.actor,
    target: caseDefinition.target,
    expectation: caseDefinition.expectation,
    verdict,
    note,
    updateError,
    beforeUserRole: before.user?.role || '',
    afterUserRole: after.user?.role || '',
    afterVerifiedSeller: after.user?.is_verified_seller ?? null,
    afterTrustedSeller: after.user?.is_trusted_seller ?? null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!Number.isInteger(args.updateSpacingMs) || args.updateSpacingMs < 0) {
    throw new Error('--update-spacing-ms must be zero or a positive integer.');
  }

  const environmentName = assertSafeEnvironment({ allowProduction: args.allowProduction });
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseAnonKey = requireEnv('SUPABASE_ANON_KEY');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const adminClient = createAdminClient(supabaseUrl, serviceRoleKey);
  const emailDomain = args.emailDomain || DEFAULT_EMAIL_DOMAIN;

  if (args.cleanupRunId) {
    await cleanupRun({
      adminClient,
      cleanupRunId: args.cleanupRunId,
      emailDomain,
    });
    return;
  }

  const runId = sanitizeValue(args.runId || createRunId());
  const profilesEnabled = await detectProfilesTable(adminClient);
  const seedSpecs = buildSeedSpecs(runId, emailDomain);
  const buyerSeed = await ensureSeedUser({ adminClient, profilesEnabled, spec: seedSpecs.buyer });
  const sellerSeed = await ensureSeedUser({ adminClient, profilesEnabled, spec: seedSpecs.seller });
  const seedUsers = { buyer: buyerSeed, seller: sellerSeed };
  const cases = buildCases();

  console.log(`Starting Mafdesh adversarial profile-update test in ${environmentName}.`);
  console.log(`Run ID: ${runId}`);
  console.log(`Cases: ${cases.length}`);
  console.log(`Update spacing (ms): ${args.updateSpacingMs}`);
  console.log(`Profiles table enabled: ${profilesEnabled ? 'yes' : 'no'}`);

  const results = [];
  for (const caseDefinition of cases) {
    const userSpec = seedUsers[caseDefinition.actor];
    const result = await runCase({
      caseDefinition,
      supabaseUrl,
      supabaseAnonKey,
      adminClient,
      userSpec,
      profilesEnabled,
      updateSpacingMs: args.updateSpacingMs,
    });
    results.push(result);
    printCaseResult(result);
  }

  const outputFile = await writeReport({
    runId,
    environmentName,
    results,
  });

  printSummary({
    runId,
    results,
    outputFile,
  });
}

main().catch((error) => {
  console.error(getErrorMessage(error));
  process.exitCode = 1;
});
