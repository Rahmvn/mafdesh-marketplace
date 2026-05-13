import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_EMAIL_DOMAIN = 'example.com';
const DEFAULT_LOGIN_SPACING_MS = 1200;
const NON_PROD_ENV_NAMES = new Set(['local', 'development', 'dev', 'test', 'testing', 'staging', 'qa']);
const PROD_CONFIRMATION_VALUE = 'YES_I_REALLY_MEAN_IT';
const SAFE_NETWORK_RETRY_DELAYS_MS = [500, 1500, 3000];
let loginOperationQueue = Promise.resolve();

function parseArgs(argv) {
  const parsed = {
    cleanupRunId: '',
    emailDomain: DEFAULT_EMAIL_DOMAIN,
    loginSpacingMs: DEFAULT_LOGIN_SPACING_MS,
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

    if (arg === '--login-spacing-ms') {
      parsed.loginSpacingMs = Number(argv[index + 1] || DEFAULT_LOGIN_SPACING_MS);
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
Mafdesh adversarial login test

Usage:
  node scripts/login-adversarial-test.mjs
  node scripts/login-adversarial-test.mjs --login-spacing-ms 1200
  node scripts/login-adversarial-test.mjs --cleanup-run-id <runId>

Required environment variables:
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  MAFDESH_SUPABASE_ENV=local|development|test|staging|qa

Safety:
  - Refuses to run unless MAFDESH_SUPABASE_ENV is non-production.
  - Seeds only a tiny buyer/seller pair for controlled login checks.
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
  return `login${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
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

function isInvalidCredentialsMessage(message) {
  const normalized = String(message || '').toLowerCase();
  return (
    normalized.includes('invalid login credentials') ||
    normalized.includes('email not confirmed') ||
    normalized.includes('invalid email or password')
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

async function enqueueLoginOperation(operation, spacingMs) {
  const queuedOperation = loginOperationQueue
    .catch(() => undefined)
    .then(async () => {
      const result = await operation();
      if (spacingMs > 0) {
        await delay(spacingMs);
      }
      return result;
    });

  loginOperationQueue = queuedOperation.catch(() => undefined);
  return queuedOperation;
}

function buildSeedMetadata({ role, runId }) {
  const seller = role === 'seller';
  const suffix = sanitizeValue(runId).slice(-8) || 'seed';
  return {
    role,
    full_name: seller ? 'Seller Login Control' : 'Buyer Login Control',
    username: seller ? `seller_login_${suffix}` : `buyer_login_${suffix}`,
    phone_number: seller ? '08012345678' : '08087654321',
    date_of_birth: '1998-04-10',
    business_name: seller ? 'Login Control Store' : null,
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
      email: `login-buyer.${normalizedRunId}@${emailDomain}`,
      password: 'Mafdesh!LoginBuyer1',
      metadata: buildSeedMetadata({ role: 'buyer', runId }),
    },
    seller: {
      role: 'seller',
      email: `login-seller.${normalizedRunId}@${emailDomain}`,
      password: 'Mafdesh!LoginSeller1',
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
        .select('id, role, email')
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
          .select('id, full_name, username, location')
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

function buildCases(seedUsers) {
  return [
    {
      id: 'control_buyer_valid',
      expectation: 'should_accept',
      email: seedUsers.buyer.email,
      password: seedUsers.buyer.password,
      expectedRole: 'buyer',
    },
    {
      id: 'control_seller_valid',
      expectation: 'should_accept',
      email: seedUsers.seller.email,
      password: seedUsers.seller.password,
      expectedRole: 'seller',
    },
    {
      id: 'wrong_password',
      expectation: 'should_reject',
      email: seedUsers.buyer.email,
      password: 'DefinitelyWrongPassword!',
    },
    {
      id: 'unknown_email',
      expectation: 'should_reject',
      email: `unknown-login.${sanitizeValue(seedUsers.buyer.email).replace(/[^a-z0-9]+/g, '') || 'user'}@${DEFAULT_EMAIL_DOMAIN}`,
      password: seedUsers.buyer.password,
    },
    {
      id: 'empty_email',
      expectation: 'should_reject',
      email: '',
      password: seedUsers.buyer.password,
    },
    {
      id: 'empty_password',
      expectation: 'should_reject',
      email: seedUsers.buyer.email,
      password: '',
    },
    {
      id: 'malformed_email',
      expectation: 'should_reject',
      email: 'not-an-email',
      password: seedUsers.buyer.password,
    },
    {
      id: 'sqlish_email_payload',
      expectation: 'should_reject',
      email: `buyer' OR 1=1 --@${DEFAULT_EMAIL_DOMAIN}`,
      password: seedUsers.buyer.password,
    },
    {
      id: 'email_case_and_spaces',
      expectation: 'should_accept_when_normalized',
      email: `  ${seedUsers.buyer.email.toUpperCase()}  `,
      password: seedUsers.buyer.password,
      normalizedEmail: seedUsers.buyer.email,
      expectedRole: 'buyer',
    },
    {
      id: 'repeat_valid_login',
      expectation: 'should_accept',
      email: seedUsers.buyer.email,
      password: seedUsers.buyer.password,
      expectedRole: 'buyer',
    },
  ];
}

async function fetchAuthenticatedContext({ client, userId, profilesEnabled }) {
  const userResult = await client
    .from('users')
    .select('id, email, role, phone_number, business_name')
    .eq('id', userId)
    .maybeSingle();

  if (userResult.error) {
    throw userResult.error;
  }

  let profile = null;
  if (profilesEnabled) {
    const profileResult = await client
      .from('profiles')
      .select('id, full_name, username, location')
      .eq('id', userId)
      .maybeSingle();

    if (profileResult.error) {
      throw profileResult.error;
    }

    profile = profileResult.data || null;
  }

  return {
    publicUser: userResult.data || null,
    publicProfile: profile,
  };
}

function classifyCase(caseDefinition, outcome) {
  const { expectation, expectedRole } = caseDefinition;
  const { loginSucceeded, errorMessage, publicUser, publicProfile, normalizedLoginEmail } = outcome;

  if (expectation === 'should_accept') {
    if (loginSucceeded && publicUser?.id && publicUser?.role === expectedRole) {
      return { verdict: 'pass', note: 'Login succeeded and role/context resolved as expected.' };
    }

    return { verdict: 'fail', note: `Expected a successful login flow, but got: ${errorMessage || 'unknown failure'}` };
  }

  if (expectation === 'should_accept_when_normalized') {
    if (!loginSucceeded) {
      return { verdict: 'warn', note: `Login was rejected. Check whether the app trims/lowercases email before auth. Error: ${errorMessage || 'unknown failure'}` };
    }

    if (publicUser?.role !== expectedRole) {
      return { verdict: 'fail', note: `Login succeeded but resolved the wrong role: ${publicUser?.role || 'unknown'}.` };
    }

    return { verdict: 'pass', note: `Login succeeded after normalization-sensitive input. Normalized email=${normalizedLoginEmail}` };
  }

  if (expectation === 'should_reject') {
    if (!loginSucceeded) {
      const safeMessage = errorMessage || 'Login was rejected.';
      return { verdict: 'pass', note: isInvalidCredentialsMessage(safeMessage) ? 'Invalid credentials were rejected as expected.' : `Login was rejected: ${safeMessage}` };
    }

    if (!publicUser?.id) {
      return { verdict: 'warn', note: 'Login partially succeeded but no public user row was readable.' };
    }

    return { verdict: 'fail', note: 'Unexpectedly logged in with invalid or malformed credentials.' };
  }

  if (publicProfile?.id || publicUser?.id) {
    return { verdict: 'pass', note: 'Login succeeded and public context was readable.' };
  }

  return { verdict: 'warn', note: 'Login finished but public context could not be verified.' };
}

function printCaseResult(result) {
  const prefix = result.verdict.toUpperCase();
  console.log(
    `[${prefix}] ${result.caseId} | expected=${result.expectation} | login=${result.loginSucceeded ? 'yes' : 'no'} | role=${result.resultingRole || '-'} | note=${result.note}`
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

  const outputFile = path.join(reportsDir, `login-adversarial-test-${runId}.json`);
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

  console.log('\n=== Mafdesh Adversarial Login Summary ===');
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
  console.log(`- node scripts/login-adversarial-test.mjs --cleanup-run-id ${runId}`);
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

async function runCase({ caseDefinition, supabaseUrl, supabaseAnonKey, profilesEnabled, loginSpacingMs }) {
  const normalizedEmail = String(caseDefinition.email || '').trim().toLowerCase();
  const loginClient = createAnonClient(supabaseUrl, supabaseAnonKey);
  let loginSucceeded = false;
  let createdAuthUserId = '';
  let errorMessage = '';
  let publicUser = null;
  let publicProfile = null;

  try {
    const { data, error } = await executeWithNetworkRetries(() =>
      enqueueLoginOperation(
        () =>
          loginClient.auth.signInWithPassword({
            email: normalizedEmail,
            password: caseDefinition.password,
          }),
        loginSpacingMs
      )
    );

    if (error) {
      throw error;
    }

    loginSucceeded = Boolean(data?.user || data?.session?.user);
    createdAuthUserId = data?.user?.id || data?.session?.user?.id || '';

    if (createdAuthUserId) {
      const context = await fetchAuthenticatedContext({
        client: loginClient,
        userId: createdAuthUserId,
        profilesEnabled,
      });
      publicUser = context.publicUser;
      publicProfile = context.publicProfile;
    }
  } catch (error) {
    errorMessage = getErrorMessage(error);
  }

  const { verdict, note } = classifyCase(caseDefinition, {
    loginSucceeded,
    errorMessage,
    publicUser,
    publicProfile,
    normalizedLoginEmail: normalizedEmail,
  });

  return {
    caseId: caseDefinition.id,
    expectation: caseDefinition.expectation,
    verdict,
    note,
    loginSucceeded,
    errorMessage,
    authUserId: createdAuthUserId,
    attemptedEmail: caseDefinition.email,
    normalizedLoginEmail: normalizedEmail,
    resultingRole: publicUser?.role || '',
    storedUsername: publicProfile?.username || '',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!Number.isInteger(args.loginSpacingMs) || args.loginSpacingMs < 0) {
    throw new Error('--login-spacing-ms must be zero or a positive integer.');
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
  const cases = buildCases({ buyer: buyerSeed, seller: sellerSeed });

  console.log(`Starting Mafdesh adversarial login test in ${environmentName}.`);
  console.log(`Run ID: ${runId}`);
  console.log(`Cases: ${cases.length}`);
  console.log(`Login spacing (ms): ${args.loginSpacingMs}`);
  console.log(`Profiles table enabled: ${profilesEnabled ? 'yes' : 'no'}`);

  const results = [];
  for (const caseDefinition of cases) {
    const result = await runCase({
      caseDefinition,
      supabaseUrl,
      supabaseAnonKey,
      profilesEnabled,
      loginSpacingMs: args.loginSpacingMs,
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
