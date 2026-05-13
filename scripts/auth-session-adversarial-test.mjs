import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_EMAIL_DOMAIN = 'example.com';
const DEFAULT_STEP_SPACING_MS = 1200;
const NON_PROD_ENV_NAMES = new Set(['local', 'development', 'dev', 'test', 'testing', 'staging', 'qa']);
const PROD_CONFIRMATION_VALUE = 'YES_I_REALLY_MEAN_IT';
const SAFE_NETWORK_RETRY_DELAYS_MS = [500, 1500, 3000];

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
      continue;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`
Mafdesh auth session test

Usage:
  node scripts/auth-session-adversarial-test.mjs
  node scripts/auth-session-adversarial-test.mjs --step-spacing-ms 1200
  node scripts/auth-session-adversarial-test.mjs --cleanup-run-id <runId>

Required environment variables:
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  MAFDESH_SUPABASE_ENV=local|development|test|staging|qa

Safety:
  - Refuses to run unless MAFDESH_SUPABASE_ENV is non-production.
  - Seeds only one buyer account for controlled recovery/session checks.
  - Uses service role only in this backend script for setup, recovery-link generation, verification, and cleanup.
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
  return `authsession${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
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
    normalized.includes('invalid email or password') ||
    normalized.includes('missing email or phone')
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

function buildSeedSpec(runId, emailDomain) {
  const normalizedRunId = sanitizeValue(runId);
  const suffix = normalizedRunId.slice(-8) || 'seed';
  const emailToken = normalizedRunId.replace(/[^a-z0-9]+/g, '').slice(-12) || 'sessionseed';
  return {
    role: 'buyer',
    email: `as${emailToken}@${emailDomain}`,
    password: 'Mafdesh!SessionBuyer1',
    nextPassword: 'Mafdesh!SessionBuyer2',
    metadata: {
      role: 'buyer',
      full_name: 'Auth Session Control',
      username: `auth_session_${suffix}`,
      phone_number: '08087654321',
      date_of_birth: '1998-04-10',
      business_name: null,
      location: 'Lagos',
      university_id: null,
      university_name: 'Mafdesh Buyer University',
      university_state: 'Lagos',
      university_zone: 'South West',
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

async function listMatchingUsers(adminClient, cleanupRunId, emailDomain) {
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

  return matchedUsers;
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

async function cleanupRun({ adminClient, cleanupRunId, emailDomain }) {
  const users = await listMatchingUsers(adminClient, cleanupRunId, emailDomain);

  if (users.length === 0) {
    console.log(`No auth users found for run id "${cleanupRunId}".`);
    return;
  }

  console.log(`Found ${users.length} auth users for cleanup run id "${cleanupRunId}".`);

  for (const user of users) {
    const email = user.email || '(no email)';
    try {
      await deleteUserArtifacts(adminClient, user.id);
      console.log(`[CLEANED] ${email}`);
    } catch (error) {
      console.log(`[FAILED] Cleanup auth delete for ${email}: ${getErrorMessage(error)}`);
    }
  }
}

async function ensureSeedUser({ adminClient, profilesEnabled, spec }) {
  const existingUsers = await listAuthUsersByExactEmail(adminClient, spec.email);
  for (const existingUser of existingUsers) {
    if (String(existingUser.email || '').trim().toLowerCase() === spec.email.toLowerCase()) {
      await deleteUserArtifacts(adminClient, existingUser.id);
    }
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

  const publicUser = await waitForRecord({
    label: `public.users for ${spec.email}`,
    operation: async () => {
      const result = await adminClient
        .from('users')
        .select('id, email, role')
        .eq('id', userId)
        .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      return result.data || null;
    },
  });

  let publicProfile = null;
  if (profilesEnabled) {
    publicProfile = await waitForRecord({
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
    ...spec,
    userId,
    publicUser,
    publicProfile,
  };
}

async function signInAndFetchContext({ supabaseUrl, supabaseAnonKey, email, password, profilesEnabled }) {
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

  const session = data?.session || null;
  const userId = data?.user?.id || session?.user?.id || '';
  if (!userId) {
    throw new Error('Login returned no authenticated user id.');
  }

  const userResult = await client
    .from('users')
    .select('id, email, role')
    .eq('id', userId)
    .maybeSingle();

  if (userResult.error) {
    throw userResult.error;
  }

  let profileResult = { data: null, error: null };
  if (profilesEnabled) {
    profileResult = await client
      .from('profiles')
      .select('id, full_name, username, location')
      .eq('id', userId)
      .maybeSingle();

    if (profileResult.error) {
      throw profileResult.error;
    }
  }

  return {
    client,
    session,
    userId,
    publicUser: userResult.data || null,
    publicProfile: profileResult.data || null,
  };
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

function printCaseResult(result) {
  const prefix = result.verdict.toUpperCase();
  console.log(`[${prefix}] ${result.caseId} | note=${result.note}`);
}

async function writeReport({ runId, environmentName, results }) {
  const reportsDir = path.join(__dirname, '..', 'tmp');
  await fs.mkdir(reportsDir, { recursive: true });

  const outputFile = path.join(reportsDir, `auth-session-adversarial-test-${runId}.json`);
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

  console.log('\n=== Mafdesh Auth Session Summary ===');
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
  console.log(`- node scripts/auth-session-adversarial-test.mjs --cleanup-run-id ${runId}`);
  console.log('- Keep SUPABASE_SERVICE_ROLE_KEY in backend-only env files or terminal env vars.');
}

async function runFlow({ runId, supabaseUrl, supabaseAnonKey, adminClient, seedUser, profilesEnabled, stepSpacingMs }) {
  const results = [];

  async function recordCase(caseId, execute) {
    try {
      const note = await execute();
      results.push({ caseId, verdict: 'pass', note });
    } catch (error) {
      results.push({ caseId, verdict: 'fail', note: getErrorMessage(error) || 'Unknown failure' });
    }

    printCaseResult(results[results.length - 1]);

    if (stepSpacingMs > 0) {
      await delay(stepSpacingMs);
    }
  }

  let activeSession = null;
  let refreshTokenBeforeSignOut = '';

  await recordCase('control_login_before_reset', async () => {
    const outcome = await signInAndFetchContext({
      supabaseUrl,
      supabaseAnonKey,
      email: seedUser.email,
      password: seedUser.password,
      profilesEnabled,
    });

    activeSession = outcome.session;
    refreshTokenBeforeSignOut = outcome.session?.refresh_token || '';

    if (!outcome.publicUser?.id || outcome.publicUser.role !== 'buyer') {
      throw new Error('Login succeeded but public.users did not resolve to the expected buyer context.');
    }

    return 'Login succeeded and public user/profile context resolved before password reset.';
  });

  await recordCase('password_reset_request_existing_email', async () => {
    const client = createAnonClient(supabaseUrl, supabaseAnonKey);
    const response = await executeWithNetworkRetries(() =>
      client.auth.resetPasswordForEmail(seedUser.email, {
        redirectTo: 'https://example.com/recovery',
      })
    );

    if (response.error) {
      throw response.error;
    }

    return 'Password reset request for existing email was accepted without error.';
  });

  await recordCase('password_reset_request_unknown_email', async () => {
    const client = createAnonClient(supabaseUrl, supabaseAnonKey);
    const response = await executeWithNetworkRetries(() =>
      client.auth.resetPasswordForEmail(`unknown-${sanitizeValue(runId)}@${DEFAULT_EMAIL_DOMAIN}`, {
        redirectTo: 'https://example.com/recovery',
      })
    );

    if (response.error) {
      throw response.error;
    }

    return 'Unknown-email password reset request returned a generic success response.';
  });

  await recordCase('recovery_link_verification_and_password_change', async () => {
    const recoveryClient = createAnonClient(supabaseUrl, supabaseAnonKey);
    const linkResponse = await executeWithNetworkRetries(() =>
      adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: seedUser.email,
        options: {
          redirectTo: 'https://example.com/recovery',
        },
      })
    );

    if (linkResponse.error) {
      throw linkResponse.error;
    }

    const hashedToken = linkResponse.data?.properties?.hashed_token;
    if (!hashedToken) {
      throw new Error('Recovery link generation returned no hashed token.');
    }

    const verifyResponse = await executeWithNetworkRetries(() =>
      recoveryClient.auth.verifyOtp({
        token_hash: hashedToken,
        type: 'recovery',
      })
    );

    if (verifyResponse.error) {
      throw verifyResponse.error;
    }

    const updateResponse = await executeWithNetworkRetries(() =>
      recoveryClient.auth.updateUser({
        password: seedUser.nextPassword,
      })
    );

    if (updateResponse.error) {
      throw updateResponse.error;
    }

    return 'Recovery link was verified and password change completed successfully.';
  });

  await recordCase('old_password_rejected_after_reset', async () => {
    try {
      await signInAndFetchContext({
        supabaseUrl,
        supabaseAnonKey,
        email: seedUser.email,
        password: seedUser.password,
        profilesEnabled,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      if (isInvalidCredentialsMessage(message)) {
        return 'Old password was rejected after reset as expected.';
      }

      throw error;
    }

    throw new Error('Old password still worked after recovery reset.');
  });

  await recordCase('new_password_login_after_reset', async () => {
    const outcome = await signInAndFetchContext({
      supabaseUrl,
      supabaseAnonKey,
      email: seedUser.email,
      password: seedUser.nextPassword,
      profilesEnabled,
    });

    activeSession = outcome.session;
    refreshTokenBeforeSignOut = outcome.session?.refresh_token || '';

    if (!outcome.publicUser?.id || outcome.publicUser.role !== 'buyer') {
      throw new Error('New-password login succeeded but public context did not resolve correctly.');
    }

    return 'New password login succeeded and public context remained intact after recovery.';
  });

  await recordCase('session_refresh_works_with_valid_refresh_token', async () => {
    if (!activeSession?.refresh_token) {
      throw new Error('No active refresh token available to test session refresh.');
    }

    const refreshClient = createAnonClient(supabaseUrl, supabaseAnonKey);
    const refreshResponse = await executeWithNetworkRetries(() =>
      refreshClient.auth.refreshSession({
        refresh_token: activeSession.refresh_token,
      })
    );

    if (refreshResponse.error) {
      throw refreshResponse.error;
    }

    const refreshedSession = refreshResponse.data?.session || null;
    if (!refreshedSession?.access_token || !refreshedSession?.refresh_token) {
      throw new Error('Refresh succeeded but returned no new session tokens.');
    }

    activeSession = refreshedSession;
    refreshTokenBeforeSignOut = refreshedSession.refresh_token;
    return 'Session refresh succeeded with a valid refresh token.';
  });

  await recordCase('sign_out_clears_local_session', async () => {
    const logoutClient = createAnonClient(supabaseUrl, supabaseAnonKey);
    await executeWithNetworkRetries(() => logoutClient.auth.setSession(activeSession));

    const signOutResponse = await executeWithNetworkRetries(() =>
      logoutClient.auth.signOut({
        scope: 'global',
      })
    );

    if (signOutResponse.error) {
      throw signOutResponse.error;
    }

    const sessionResponse = await executeWithNetworkRetries(() => logoutClient.auth.getSession());
    const remainingSession = sessionResponse.data?.session || null;
    if (remainingSession) {
      throw new Error('Local session still exists after sign-out.');
    }

    return 'Global sign-out cleared the local session state.';
  });

  await recordCase('revoked_refresh_token_rejected_after_sign_out', async () => {
    if (!refreshTokenBeforeSignOut) {
      throw new Error('No pre-sign-out refresh token captured to test revocation.');
    }

    const refreshClient = createAnonClient(supabaseUrl, supabaseAnonKey);

    try {
      const refreshResponse = await executeWithNetworkRetries(() =>
        refreshClient.auth.refreshSession({
          refresh_token: refreshTokenBeforeSignOut,
        })
      );

      if (refreshResponse.error) {
        throw refreshResponse.error;
      }
    } catch (error) {
      return `Refresh token was rejected after global sign-out: ${getErrorMessage(error)}`;
    }

    throw new Error('Refresh token still worked after global sign-out.');
  });

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!Number.isInteger(args.stepSpacingMs) || args.stepSpacingMs < 0) {
    throw new Error('--step-spacing-ms must be zero or a positive integer.');
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
  const seedSpec = buildSeedSpec(runId, emailDomain);
  const seedUser = await ensureSeedUser({
    adminClient,
    profilesEnabled,
    spec: seedSpec,
  });

  console.log(`Starting Mafdesh auth session test in ${environmentName}.`);
  console.log(`Run ID: ${runId}`);
  console.log('Cases: 9');
  console.log(`Step spacing (ms): ${args.stepSpacingMs}`);
  console.log(`Profiles table enabled: ${profilesEnabled ? 'yes' : 'no'}`);

  const results = await runFlow({
    runId,
    supabaseUrl,
    supabaseAnonKey,
    adminClient,
    seedUser,
    profilesEnabled,
    stepSpacingMs: args.stepSpacingMs,
  });

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
