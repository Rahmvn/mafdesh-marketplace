import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_TOTAL_USERS = 100;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_EMAIL_DOMAIN = 'example.com';
const DEFAULT_SIGNUP_SPACING_MS = 1500;
const NON_PROD_ENV_NAMES = new Set(['local', 'development', 'dev', 'test', 'testing', 'staging', 'qa']);
const PROD_CONFIRMATION_VALUE = 'YES_I_REALLY_MEAN_IT';
const RATE_LIMIT_RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
let signupOperationQueue = Promise.resolve();

function parseArgs(argv) {
  const parsed = {
    cleanupRunId: '',
    totalUsers: DEFAULT_TOTAL_USERS,
    concurrency: DEFAULT_CONCURRENCY,
    emailDomain: DEFAULT_EMAIL_DOMAIN,
    signupSpacingMs: DEFAULT_SIGNUP_SPACING_MS,
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

    if (arg === '--users') {
      parsed.totalUsers = Number(argv[index + 1] || DEFAULT_TOTAL_USERS);
      index += 1;
      continue;
    }

    if (arg === '--concurrency') {
      parsed.concurrency = Number(argv[index + 1] || DEFAULT_CONCURRENCY);
      index += 1;
      continue;
    }

    if (arg === '--email-domain') {
      parsed.emailDomain = String(argv[index + 1] || DEFAULT_EMAIL_DOMAIN).trim() || DEFAULT_EMAIL_DOMAIN;
      index += 1;
      continue;
    }

    if (arg === '--signup-spacing-ms') {
      parsed.signupSpacingMs = Number(argv[index + 1] || DEFAULT_SIGNUP_SPACING_MS);
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
Mafdesh signup stress test

Usage:
  node scripts/signup-stress-test.mjs
  node scripts/signup-stress-test.mjs --users 100 --concurrency 5
  node scripts/signup-stress-test.mjs --users 100 --concurrency 3 --signup-spacing-ms 1500
  node scripts/signup-stress-test.mjs --cleanup-run-id <runId>

Required environment variables:
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  MAFDESH_SUPABASE_ENV=local|development|test|staging|qa

Optional environment variables:
  MAFDESH_ALLOW_PRODUCTION_STRESS_TEST=${PROD_CONFIRMATION_VALUE}

Safety:
  This script refuses to run against production unless both:
  1. --allow-production is passed
  2. MAFDESH_ALLOW_PRODUCTION_STRESS_TEST=${PROD_CONFIRMATION_VALUE}

Notes:
  - Uses anon auth signup for the actual signup test.
  - Uses service role only in this backend script for email confirmation, verification reads, and cleanup.
  - Spaces signup attempts and retries rate-limited auth requests with backoff.
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
  const isoStamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `run${isoStamp}`;
}

function padUserNumber(index) {
  return String(index).padStart(3, '0');
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getErrorMessage(error) {
  return String(error?.message || error || '').trim();
}

function getErrorStatus(error) {
  const rawStatus = error?.status ?? error?.statusCode ?? error?.code;
  const numericStatus = Number(rawStatus);
  return Number.isFinite(numericStatus) ? numericStatus : null;
}

function isRateLimitError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    getErrorStatus(error) === 429 ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  );
}

function sanitizeValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildEmail({ runId, userNumber, emailDomain }) {
  return `testuser${padUserNumber(userNumber)}.${sanitizeValue(runId)}@${emailDomain}`;
}

function buildPassword({ userNumber, role }) {
  return `Mafdesh!${role === 'seller' ? 'Seller' : 'Buyer'}${padUserNumber(userNumber)}`;
}

function buildSignupPayload({ userNumber, role, runId }) {
  const suffix = padUserNumber(userNumber);
  const state = role === 'seller' ? 'Kaduna' : 'Lagos';
  const zone = role === 'seller' ? 'North West' : 'South West';

  return {
    role,
    full_name: `${role === 'seller' ? 'Seller' : 'Buyer'} Test ${suffix}`,
    username: `mafdesh_${sanitizeValue(runId)}_${role}_${suffix}`,
    phone_number: `080${String(10000000 + userNumber).slice(-8)}`,
    date_of_birth: `199${userNumber % 10}-0${(userNumber % 9) + 1}-1${userNumber % 9}`,
    business_name: role === 'seller' ? `Mafdesh Test Store ${suffix}` : null,
    location: state,
    university_id: null,
    university_name: role === 'seller' ? `Mafdesh Seller University ${suffix}` : `Mafdesh Buyer University ${suffix}`,
    university_state: state,
    university_zone: zone,
  };
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

function enqueueSignupOperation(operation, spacingMs) {
  const queuedOperation = signupOperationQueue
    .catch(() => undefined)
    .then(async () => {
      const result = await operation();
      if (spacingMs > 0) {
        await delay(spacingMs);
      }
      return result;
    });

  signupOperationQueue = queuedOperation.catch(() => undefined);
  return queuedOperation;
}

async function executeWithRateLimitRetries(operation) {
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRateLimitError(error) || attempt === RATE_LIMIT_RETRY_DELAYS_MS.length) {
        throw error;
      }

      const retryDelay = RATE_LIMIT_RETRY_DELAYS_MS[attempt];
      console.log(`[RATE_LIMIT] Waiting ${retryDelay}ms before retrying auth signup.`);
      await delay(retryDelay);
    }
  }

  throw new Error('Rate limit retry loop exhausted unexpectedly.');
}

async function detectProfilesTable(adminClient) {
  const { error } = await adminClient.from('profiles').select('id').limit(1);

  if (!error) {
    return true;
  }

  const message = String(error.message || '').toLowerCase();
  if (message.includes('relation') && message.includes('profiles') && message.includes('does not exist')) {
    return false;
  }

  throw error;
}

async function waitForRecord({ read, label, attempts = 10, delayMs = 400 }) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await read();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await delay(delayMs);
    }
  }

  if (lastError) {
    throw new Error(`${label} check failed: ${lastError.message || lastError}`);
  }

  return null;
}

async function signUpAndVerifyUser({
  adminClient,
  supabaseUrl,
  supabaseAnonKey,
  profilesEnabled,
  runId,
  userNumber,
  emailDomain,
  signupSpacingMs,
}) {
  const role = userNumber % 2 === 0 ? 'seller' : 'buyer';
  const email = buildEmail({ runId, userNumber, emailDomain });
  const password = buildPassword({ userNumber, role });
  const metadata = buildSignupPayload({ userNumber, role, runId });
  const signUpClient = createAnonClient(supabaseUrl, supabaseAnonKey);

  const result = {
    runId,
    userNumber,
    email,
    role,
    success: false,
    failedStep: '',
    errorMessage: '',
    authUserId: '',
  };

  try {
    const { data, error } = await executeWithRateLimitRetries(() =>
      enqueueSignupOperation(
        () =>
          signUpClient.auth.signUp({
            email,
            password,
            options: {
              data: metadata,
            },
          }),
        signupSpacingMs
      )
    );

    if (error) {
      throw new Error(error.message || 'Supabase auth signup failed.');
    }

    const authUser = data?.user || data?.session?.user || null;
    if (!authUser?.id) {
      throw new Error('Supabase auth signup returned no user id.');
    }

    result.authUserId = authUser.id;

    const { error: confirmError } = await adminClient.auth.admin.updateUserById(authUser.id, {
      email_confirm: true,
    });

    if (confirmError) {
      throw new Error(confirmError.message || 'Failed to confirm test user email.');
    }

    const loginClient = createAnonClient(supabaseUrl, supabaseAnonKey);
    const loginResponse = await loginClient.auth.signInWithPassword({
      email,
      password,
    });

    if (loginResponse.error) {
      throw new Error(loginResponse.error.message || 'Login after signup failed.');
    }

    const sessionUserId = loginResponse.data?.user?.id || loginResponse.data?.session?.user?.id || '';
    if (!sessionUserId) {
      throw new Error('Login after signup returned no authenticated user.');
    }

    const usersRow = await waitForRecord({
      label: 'public.users',
      read: async () => {
        const { data: publicUser, error: userError } = await loginClient
          .from('users')
          .select('id, role, email')
          .eq('id', sessionUserId)
          .maybeSingle();

        if (userError) {
          throw userError;
        }

        return publicUser?.id ? publicUser : null;
      },
    });

    if (!usersRow) {
      throw new Error('public.users row was not created.');
    }

    if (usersRow.role !== role) {
      throw new Error(`Role mismatch. Expected ${role}, received ${usersRow.role || 'unknown'}.`);
    }

    if (profilesEnabled) {
      const profileRow = await waitForRecord({
        label: 'public.profiles',
        read: async () => {
          const { data: profile, error: profileError } = await loginClient
            .from('profiles')
            .select('id')
            .eq('id', sessionUserId)
            .maybeSingle();

          if (profileError) {
            throw profileError;
          }

          return profile?.id ? profile : null;
        },
      });

      if (!profileRow) {
        throw new Error('public.profiles row was not created.');
      }
    }

    await loginClient.auth.signOut();
    result.success = true;
    return result;
  } catch (error) {
    const normalizedMessage = getErrorMessage(error) || 'Unknown failure';
    const currentStep =
      result.authUserId
        ? normalizedMessage.includes('Role mismatch')
          ? 'role_detection'
          : normalizedMessage.includes('public.profiles')
            ? 'profiles_row_check'
            : normalizedMessage.includes('public.users')
              ? 'users_row_check'
              : normalizedMessage.includes('login')
                ? 'login_after_signup'
                : normalizedMessage.includes('confirm')
                  ? 'email_confirm'
                  : 'unknown'
        : 'auth_signup';
    result.failedStep = isRateLimitError(error) ? `${currentStep}_rate_limited` : currentStep;
    result.errorMessage = normalizedMessage;
    return result;
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
  return results;
}

function groupFailureReasons(results) {
  return results
    .filter((result) => !result.success)
    .reduce((accumulator, result) => {
      const key = `${result.failedStep}: ${result.errorMessage}`;
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});
}

function printPerUserResult(result) {
  if (result.success) {
    console.log(`[SUCCESS] ${result.email} | role=${result.role} | authUserId=${result.authUserId}`);
    return;
  }

  console.log(
    `[FAILED] ${result.email} | role=${result.role} | step=${result.failedStep} | error=${result.errorMessage}`
  );
}

function printSummary({ runId, totalAttempted, successfulResults, failedResults, groupedFailureReasons, outputFile }) {
  console.log('\n=== Mafdesh Signup Stress Test Summary ===');
  console.log(`Run ID: ${runId}`);
  console.log(`Total attempted: ${totalAttempted}`);
  console.log(`Total successful: ${successfulResults.length}`);
  console.log(`Total failed: ${failedResults.length}`);

  if (Object.keys(groupedFailureReasons).length > 0) {
    console.log('Failure reasons grouped together:');
    Object.entries(groupedFailureReasons)
      .sort((left, right) => right[1] - left[1])
      .forEach(([reason, count]) => {
        console.log(`- ${count}x ${reason}`);
      });
  } else {
    console.log('Failure reasons grouped together: none');
  }

  console.log(`Detailed report: ${outputFile}`);
  console.log('\nSafe cleanup instructions:');
  console.log(`- Delete this test run only: node scripts/signup-stress-test.mjs --cleanup-run-id ${runId}`);
  console.log('- Keep SUPABASE_SERVICE_ROLE_KEY in backend-only env files or terminal env vars.');
  console.log('- Do not place SUPABASE_SERVICE_ROLE_KEY in Vite env files or frontend code.');
}

async function writeReport({ runId, environmentName, results }) {
  const reportsDir = path.join(__dirname, '..', 'tmp');
  await fs.mkdir(reportsDir, { recursive: true });

  const outputFile = path.join(reportsDir, `signup-stress-test-${runId}.json`);
  const payload = {
    runId,
    environmentName,
    createdAt: new Date().toISOString(),
    results,
  };

  await fs.writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return outputFile;
}

async function listMatchingUsers(adminClient, runId, emailDomain) {
  const matchedUsers = [];
  let page = 1;
  const pageSize = 200;
  const emailNeedle = `.${sanitizeValue(runId)}@${emailDomain}`.toLowerCase();

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: pageSize,
    });

    if (error) {
      throw new Error(error.message || 'Failed to list auth users for cleanup.');
    }

    const users = Array.isArray(data?.users) ? data.users : [];
    users.forEach((user) => {
      const email = String(user.email || '').toLowerCase();
      if (email.includes(emailNeedle)) {
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

async function cleanupRun({ adminClient, cleanupRunId, emailDomain }) {
  const users = await listMatchingUsers(adminClient, cleanupRunId, emailDomain);

  if (users.length === 0) {
    console.log(`No auth users found for run id "${cleanupRunId}".`);
    return;
  }

  console.log(`Found ${users.length} auth users for cleanup run id "${cleanupRunId}".`);

  for (const user of users) {
    const userId = user.id;
    const email = user.email || '(no email)';

    const profileDelete = await adminClient.from('profiles').delete().eq('id', userId);
    if (profileDelete.error) {
      const message = String(profileDelete.error.message || '').toLowerCase();
      if (!(message.includes('relation') && message.includes('profiles') && message.includes('does not exist'))) {
        console.log(`[WARN] Failed to delete public.profiles for ${email}: ${profileDelete.error.message}`);
      }
    }

    const usersDelete = await adminClient.from('users').delete().eq('id', userId);
    if (usersDelete.error) {
      console.log(`[WARN] Failed to delete public.users for ${email}: ${usersDelete.error.message}`);
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.log(`[FAILED] Cleanup auth delete for ${email}: ${deleteError.message}`);
      continue;
    }

    console.log(`[CLEANED] ${email}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!Number.isInteger(args.totalUsers) || args.totalUsers <= 0) {
    throw new Error('--users must be a positive integer.');
  }

  if (!Number.isInteger(args.concurrency) || args.concurrency <= 0) {
    throw new Error('--concurrency must be a positive integer.');
  }

  if (!Number.isInteger(args.signupSpacingMs) || args.signupSpacingMs < 0) {
    throw new Error('--signup-spacing-ms must be zero or a positive integer.');
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

  console.log(`Starting Mafdesh signup stress test in ${environmentName}.`);
  console.log(`Run ID: ${runId}`);
  console.log(`Users: ${args.totalUsers}`);
  console.log(`Concurrency: ${args.concurrency}`);
  console.log(`Signup spacing (ms): ${args.signupSpacingMs}`);
  console.log(`Profiles table enabled: ${profilesEnabled ? 'yes' : 'no'}`);

  const userNumbers = Array.from({ length: args.totalUsers }, (_, index) => index + 1);
  const results = await runWithConcurrency(userNumbers, args.concurrency, async (userNumber) =>
    signUpAndVerifyUser({
      adminClient,
      supabaseUrl,
      supabaseAnonKey,
      profilesEnabled,
      runId,
      userNumber,
      emailDomain,
      signupSpacingMs: args.signupSpacingMs,
    })
  );

  results.forEach(printPerUserResult);

  const successfulResults = results.filter((result) => result.success);
  const failedResults = results.filter((result) => !result.success);
  const groupedFailureReasons = groupFailureReasons(results);
  const outputFile = await writeReport({
    runId,
    environmentName,
    results,
  });

  printSummary({
    runId,
    totalAttempted: results.length,
    successfulResults,
    failedResults,
    groupedFailureReasons,
    outputFile,
  });
}

main().catch((error) => {
  console.error(`[ERROR] ${error.message || error}`);
  process.exitCode = 1;
});
