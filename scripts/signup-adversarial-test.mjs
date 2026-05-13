import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_EMAIL_DOMAIN = 'example.com';
const DEFAULT_SIGNUP_SPACING_MS = 2000;
const NON_PROD_ENV_NAMES = new Set(['local', 'development', 'dev', 'test', 'testing', 'staging', 'qa']);
const PROD_CONFIRMATION_VALUE = 'YES_I_REALLY_MEAN_IT';
const RATE_LIMIT_RETRY_DELAYS_MS = [5000, 15000, 30000];
const SAFE_NETWORK_RETRY_DELAYS_MS = [500, 1500, 3000];
let signupOperationQueue = Promise.resolve();

function parseArgs(argv) {
  const parsed = {
    cleanupRunId: '',
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
Mafdesh adversarial signup test

Usage:
  node scripts/signup-adversarial-test.mjs
  node scripts/signup-adversarial-test.mjs --signup-spacing-ms 2000
  node scripts/signup-adversarial-test.mjs --cleanup-run-id <runId>

Required environment variables:
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  MAFDESH_SUPABASE_ENV=local|development|test|staging|qa

Safety:
  - Refuses to run unless MAFDESH_SUPABASE_ENV is non-production.
  - Uses only a small fixed set of malformed-input cases.
  - Does not perform destructive or high-volume attack simulation.
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
  return `adversarial${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
}

function sanitizeValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toHumanLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildUniqueUsername(runId, caseId) {
  const runToken = String(runId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(-8) || 'run';
  const caseToken = String(caseId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16) || 'case';
  return `maf_${caseToken}_${runToken}`.slice(0, 30);
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

function isCloudflareBlockError(error) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('attention required') ||
    message.includes('sorry, you have been blocked') ||
    message.includes('cloudflare') ||
    message.includes('security service to protect itself from online attacks')
  );
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

async function waitForRecord({ read, attempts = 10, delayMs = 400 }) {
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
    throw lastError;
  }

  return null;
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
      throw new Error(error.message || 'Failed to list auth users.');
    }

    const users = Array.isArray(data?.users) ? data.users : [];
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

function buildBasePayload({ role, runId, caseId }) {
  const safeCaseId = sanitizeValue(caseId);
  const humanCaseLabel = toHumanLabel(caseId);
  const seller = role === 'seller';

  return {
    role,
    full_name: seller ? `Seller ${humanCaseLabel}` : `Buyer ${humanCaseLabel}`,
    username: buildUniqueUsername(runId, safeCaseId),
    phone_number: seller ? '08012345678' : '08087654321',
    date_of_birth: '1998-04-10',
    business_name: seller ? `Store ${humanCaseLabel}` : null,
    location: seller ? 'Kaduna' : 'Lagos',
    university_id: null,
    university_name: seller ? 'Mafdesh Seller University' : 'Mafdesh Buyer University',
    university_state: seller ? 'Kaduna' : 'Lagos',
    university_zone: seller ? 'North West' : 'South West',
  };
}

function buildCases(runId, emailDomain) {
  const duplicateEmail = `duplicate.${sanitizeValue(runId)}@${emailDomain}`;

  return [
    {
      id: 'control_buyer_valid',
      description: 'Valid buyer signup control case',
      expectation: 'should_accept',
      email: `buyer-control.${sanitizeValue(runId)}@${emailDomain}`,
      password: 'Mafdesh!BuyerControl1',
      payload: buildBasePayload({ role: 'buyer', runId, caseId: 'control_buyer_valid' }),
    },
    {
      id: 'control_seller_valid',
      description: 'Valid seller signup control case',
      expectation: 'should_accept',
      email: `seller-control.${sanitizeValue(runId)}@${emailDomain}`,
      password: 'Mafdesh!SellerControl1',
      payload: buildBasePayload({ role: 'seller', runId, caseId: 'control_seller_valid' }),
    },
    {
      id: 'empty_full_name',
      description: 'Empty full name should be rejected or sanitized',
      expectation: 'should_reject',
      email: `empty-name.${sanitizeValue(runId)}@${emailDomain}`,
      password: 'Mafdesh!EmptyName1',
      payload: {
        ...buildBasePayload({ role: 'buyer', runId, caseId: 'empty_full_name' }),
        full_name: '',
      },
    },
    {
      id: 'whitespace_full_name',
      description: 'Whitespace-only full name should be rejected or sanitized',
      expectation: 'should_reject',
      email: `whitespace-name.${sanitizeValue(runId)}@${emailDomain}`,
      password: 'Mafdesh!Whitespace1',
      payload: {
        ...buildBasePayload({ role: 'buyer', runId, caseId: 'whitespace_full_name' }),
        full_name: ' \t \u00A0 ',
      },
    },
    {
      id: 'very_long_full_name',
      description: 'Very long full name should not pass silently',
      expectation: 'should_reject',
      email: `long-name.${sanitizeValue(runId)}@${emailDomain}`,
      password: 'Mafdesh!LongName1',
      payload: {
        ...buildBasePayload({ role: 'buyer', runId, caseId: 'very_long_full_name' }),
        full_name: 'A'.repeat(350),
      },
    },
    {
      id: 'special_chars_full_name',
      description: 'Script-like and SQL-like name payload should be rejected or neutralized',
      expectation: 'should_reject_or_sanitize',
      email: `special-name.${sanitizeValue(runId)}@${emailDomain}`,
      password: 'Mafdesh!Special1',
      payload: {
        ...buildBasePayload({ role: 'buyer', runId, caseId: 'special_chars_full_name' }),
        full_name: `<script>alert("mafdesh")</script>' OR 1=1 --`,
      },
    },
    {
      id: 'weird_spaces_full_name',
      description: 'Weird Unicode spacing should be handled consistently',
      expectation: 'observe',
      email: `unicode-space.${sanitizeValue(runId)}@${emailDomain}`,
      password: 'Mafdesh!Unicode1',
      payload: {
        ...buildBasePayload({ role: 'buyer', runId, caseId: 'weird_spaces_full_name' }),
        full_name: 'John\u00A0\u2009\u200B Doe',
      },
    },
    {
      id: 'weak_password',
      description: 'Weak password should be rejected by Auth or policy',
      expectation: 'should_reject',
      email: `weak-password.${sanitizeValue(runId)}@${emailDomain}`,
      password: '12345',
      payload: buildBasePayload({ role: 'buyer', runId, caseId: 'weak_password' }),
    },
    {
      id: 'invalid_phone',
      description: 'Invalid phone should be rejected or sanitized',
      expectation: 'should_reject',
      email: `invalid-phone.${sanitizeValue(runId)}@${emailDomain}`,
      password: 'Mafdesh!Phone1',
      payload: {
        ...buildBasePayload({ role: 'buyer', runId, caseId: 'invalid_phone' }),
        phone_number: 'abc<script>123</script>',
      },
    },
    {
      id: 'invalid_date_of_birth',
      description: 'Invalid date of birth should be rejected',
      expectation: 'should_reject',
      email: `invalid-dob.${sanitizeValue(runId)}@${emailDomain}`,
      password: 'Mafdesh!Dob1',
      payload: {
        ...buildBasePayload({ role: 'buyer', runId, caseId: 'invalid_date_of_birth' }),
        date_of_birth: 'not-a-date',
      },
    },
    {
      id: 'role_admin_tamper',
      description: 'Role tampering to admin should be blocked or neutralized',
      expectation: 'should_neutralize_role',
      email: `admin-tamper.${sanitizeValue(runId)}@${emailDomain}`,
      password: 'Mafdesh!AdminTrap1',
      payload: {
        ...buildBasePayload({ role: 'buyer', runId, caseId: 'role_admin_tamper' }),
        role: 'admin',
      },
    },
    {
      id: 'seller_missing_business_name',
      description: 'Seller signup without business name should be rejected',
      expectation: 'should_reject',
      email: `seller-no-business.${sanitizeValue(runId)}@${emailDomain}`,
      password: 'Mafdesh!NoBusiness1',
      payload: {
        ...buildBasePayload({ role: 'seller', runId, caseId: 'seller_missing_business_name' }),
        business_name: null,
      },
    },
    {
      id: 'duplicate_email_initial',
      description: 'Initial signup for duplicate-email check',
      expectation: 'should_accept',
      email: duplicateEmail,
      password: 'Mafdesh!Duplicate1',
      payload: buildBasePayload({ role: 'buyer', runId, caseId: 'duplicate_email_initial' }),
    },
    {
      id: 'duplicate_email_repeat',
      description: 'Repeat signup with same email should not create a second account',
      expectation: 'duplicate_protected',
      email: duplicateEmail,
      password: 'Mafdesh!Duplicate1',
      payload: buildBasePayload({ role: 'buyer', runId, caseId: 'duplicate_email_repeat' }),
    },
  ];
}

async function readPublicRows(client, userId, profilesEnabled) {
  const rows = {
    user: null,
    profile: null,
  };

  const userResult = await client
    .from('users')
    .select('id, email, role, phone_number, business_name, verification_status, date_of_birth')
    .eq('id', userId)
    .maybeSingle();

  if (userResult.error) {
    throw userResult.error;
  }

  rows.user = userResult.data || null;

  if (profilesEnabled) {
    const profileResult = await client
      .from('profiles')
      .select('id, full_name, username, location')
      .eq('id', userId)
      .maybeSingle();

    if (profileResult.error) {
      throw profileResult.error;
    }

    rows.profile = profileResult.data || null;
  }

  return rows;
}

function classifyCase(caseDefinition, execution) {
  const { expectation, payload } = caseDefinition;
  const {
    authSignupSucceeded,
    authUsersBefore,
    authUsersAfter,
    loginSucceeded,
    publicUser,
    publicProfile,
    errorMessage,
    authMetadata,
  } = execution;

  if (expectation === 'should_accept') {
    if (authSignupSucceeded && loginSucceeded && publicUser?.id) {
      return { verdict: 'pass', note: 'Signup succeeded end to end as expected.' };
    }

    return { verdict: 'fail', note: `Expected a successful signup flow, but got: ${errorMessage || 'unknown failure'}` };
  }

  if (expectation === 'duplicate_protected') {
    if (authUsersAfter.length <= authUsersBefore.length) {
      return { verdict: 'pass', note: 'Duplicate email did not create an extra auth account.' };
    }

    return { verdict: 'fail', note: 'Duplicate email created more auth accounts than expected.' };
  }

  if (expectation === 'should_neutralize_role') {
    if (!authSignupSucceeded) {
      return { verdict: 'pass', note: 'Role tampering was rejected during signup.' };
    }

    if (publicUser?.role === 'admin') {
      return { verdict: 'fail', note: 'Dangerous: public.users role became admin.' };
    }

    return { verdict: 'pass', note: `Role tampering did not elevate privileges. Final role=${publicUser?.role || 'unknown'}.` };
  }

  if (expectation === 'should_reject_or_sanitize') {
    if (!authSignupSucceeded) {
      if (isCloudflareBlockError(errorMessage)) {
        return { verdict: 'pass', note: 'Input was blocked by upstream edge security before account creation.' };
      }

      return { verdict: 'pass', note: 'Input was rejected.' };
    }

    const storedName = publicProfile?.full_name || authMetadata?.full_name || '';
    if (storedName !== payload.full_name) {
      return { verdict: 'pass', note: 'Input was accepted but changed before storage.' };
    }

    return { verdict: 'warn', note: 'Input was accepted and appears to have been stored raw.' };
  }

  if (expectation === 'should_reject') {
    if (!authSignupSucceeded && authUsersAfter.length <= authUsersBefore.length) {
      if (isCloudflareBlockError(errorMessage)) {
        return { verdict: 'pass', note: 'Input was blocked by upstream edge security before account creation.' };
      }

      return { verdict: 'pass', note: 'Input was rejected before account creation.' };
    }

    if (!publicUser?.id) {
      return { verdict: 'warn', note: 'Signup partially succeeded but no public user row was found.' };
    }

    return { verdict: 'fail', note: 'Input was accepted and produced a real account.' };
  }

  return { verdict: 'warn', note: 'Observation-only case. Review stored values manually.' };
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

async function writeReport({ runId, environmentName, results }) {
  const reportsDir = path.join(__dirname, '..', 'tmp');
  await fs.mkdir(reportsDir, { recursive: true });

  const outputFile = path.join(reportsDir, `signup-adversarial-test-${runId}.json`);
  await fs.writeFile(
    outputFile,
    `${JSON.stringify({ runId, environmentName, createdAt: new Date().toISOString(), results }, null, 2)}\n`,
    'utf8'
  );

  return outputFile;
}

function printCaseResult(result) {
  const prefix = result.verdict.toUpperCase();
  console.log(
    `[${prefix}] ${result.caseId} | expected=${result.expectation} | signup=${result.authSignupSucceeded ? 'yes' : 'no'} | login=${result.loginSucceeded ? 'yes' : 'no'} | authUsersBefore=${result.authUsersBeforeCount} | authUsersAfter=${result.authUsersAfterCount} | note=${result.note}`
  );
}

function printSummary({ runId, results, outputFile }) {
  const verdicts = summarizeVerdicts(results);

  console.log('\n=== Mafdesh Adversarial Signup Summary ===');
  console.log(`Run ID: ${runId}`);
  console.log(`Total cases: ${results.length}`);
  console.log(`Passed: ${verdicts.pass}`);
  console.log(`Warnings: ${verdicts.warn}`);
  console.log(`Failures: ${verdicts.fail}`);

  const grouped = results.reduce((accumulator, result) => {
    const key = `${result.verdict}: ${result.note}`;
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  console.log('Grouped findings:');
  Object.entries(grouped).forEach(([reason, count]) => {
    console.log(`- ${count}x ${reason}`);
  });

  console.log(`Detailed report: ${outputFile}`);
  console.log('\nCleanup:');
  console.log(`- node scripts/signup-adversarial-test.mjs --cleanup-run-id ${runId}`);
  console.log('- Keep SUPABASE_SERVICE_ROLE_KEY in backend-only env files or terminal env vars.');
}

async function cleanupRun({ adminClient, cleanupRunId, emailDomain }) {
  const emailNeedle = `.${sanitizeValue(cleanupRunId)}@${emailDomain}`.toLowerCase();
  const users = [];
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
      throw new Error(error.message || 'Failed to list users for cleanup.');
    }

    const batch = Array.isArray(data?.users) ? data.users : [];
    batch.forEach((user) => {
      const email = String(user.email || '').toLowerCase();
      if (email.includes(emailNeedle)) {
        users.push(user);
      }
    });

    if (batch.length < pageSize) {
      break;
    }

    page += 1;
  }

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

async function runCase({
  caseDefinition,
  adminClient,
  supabaseUrl,
  supabaseAnonKey,
  profilesEnabled,
  signupSpacingMs,
}) {
  const signUpClient = createAnonClient(supabaseUrl, supabaseAnonKey);
  let authSignupSucceeded = false;
  let loginSucceeded = false;
  let createdAuthUserId = '';
  let errorMessage = '';
  let authMetadata = null;
  let publicUser = null;
  let publicProfile = null;
  let authUsersBefore = [];
  let authUsersAfter = [];

  try {
    authUsersBefore = await listAuthUsersByExactEmail(adminClient, caseDefinition.email);

    const { data, error } = await executeWithRateLimitRetries(() =>
      enqueueSignupOperation(
        () =>
          signUpClient.auth.signUp({
            email: caseDefinition.email,
            password: caseDefinition.password,
            options: {
              data: caseDefinition.payload,
            },
          }),
        signupSpacingMs
      )
    );

    if (error) {
      throw error;
    }

    authSignupSucceeded = Boolean(data?.user || data?.session?.user);
  } catch (error) {
    errorMessage = getErrorMessage(error);
  }

  try {
    authUsersAfter = await listAuthUsersByExactEmail(adminClient, caseDefinition.email);
  } catch (error) {
    if (!errorMessage) {
      errorMessage = getErrorMessage(error);
    }
  }

  const primaryAuthUser = authUsersAfter[0] || null;

  if (primaryAuthUser?.id) {
    createdAuthUserId = primaryAuthUser.id;
    authMetadata = primaryAuthUser.user_metadata || primaryAuthUser.raw_user_meta_data || null;

    const { error: confirmError } = await adminClient.auth.admin.updateUserById(primaryAuthUser.id, {
      email_confirm: true,
    });

    if (confirmError && !errorMessage) {
      errorMessage = confirmError.message || 'Email confirmation failed.';
    }

    try {
      const loginClient = createAnonClient(supabaseUrl, supabaseAnonKey);
      const loginResult = await loginClient.auth.signInWithPassword({
        email: caseDefinition.email,
        password: caseDefinition.password,
      });

      if (loginResult.error) {
        if (!errorMessage) {
          errorMessage = loginResult.error.message || 'Login failed.';
        }
      } else {
        loginSucceeded = true;

        const rows = await waitForRecord({
          read: async () => {
            const readRows = await readPublicRows(loginClient, primaryAuthUser.id, profilesEnabled);
            return readRows.user?.id ? readRows : null;
          },
        });

        publicUser = rows?.user || null;
        publicProfile = rows?.profile || null;
        await loginClient.auth.signOut();
      }
    } catch (error) {
      if (!errorMessage) {
        errorMessage = getErrorMessage(error);
      }
    }
  }

  const { verdict, note } = classifyCase(caseDefinition, {
    authSignupSucceeded,
    authUsersBefore,
    authUsersAfter,
    loginSucceeded,
    publicUser,
    publicProfile,
    errorMessage,
    authMetadata,
  });

  return {
    caseId: caseDefinition.id,
    description: caseDefinition.description,
    expectation: caseDefinition.expectation,
    verdict,
    note,
    authSignupSucceeded,
    loginSucceeded,
    authUsersBeforeCount: authUsersBefore.length,
    authUsersAfterCount: authUsersAfter.length,
    createdAuthUserId,
    errorMessage,
    requestedRole: caseDefinition.payload.role,
    resultingRole: publicUser?.role || '',
    storedPhone: publicUser?.phone_number || '',
    storedBusinessName: publicUser?.business_name || '',
    storedDateOfBirth: publicUser?.date_of_birth || '',
    storedFullName: publicProfile?.full_name || authMetadata?.full_name || '',
    storedUsername: publicProfile?.username || authMetadata?.username || '',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
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
  const cases = buildCases(runId, emailDomain);

  console.log(`Starting Mafdesh adversarial signup test in ${environmentName}.`);
  console.log(`Run ID: ${runId}`);
  console.log(`Cases: ${cases.length}`);
  console.log(`Signup spacing (ms): ${args.signupSpacingMs}`);
  console.log(`Profiles table enabled: ${profilesEnabled ? 'yes' : 'no'}`);

  const results = [];
  for (const caseDefinition of cases) {
    const result = await runCase({
      caseDefinition,
      adminClient,
      supabaseUrl,
      supabaseAnonKey,
      profilesEnabled,
      signupSpacingMs: args.signupSpacingMs,
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
  console.error(`[ERROR] ${error.message || error}`);
  process.exitCode = 1;
});
