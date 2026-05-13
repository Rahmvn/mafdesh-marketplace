# Mafdesh Signup Stress Test

This repo includes a backend-only signup stress test at `scripts/signup-stress-test.mjs`.
For malformed-input checks, use `scripts/signup-adversarial-test.mjs`.
For login checks, use `scripts/login-adversarial-test.mjs`.
For post-login update checks, use `scripts/profile-update-adversarial-test.mjs`.
For password reset and session checks, use `scripts/auth-session-adversarial-test.mjs`.
For privileged Edge Function checks, use `scripts/edge-functions-adversarial-test.mjs`.

## Safety rules

- Use a test Supabase project or test environment only.
- The script refuses to run unless `MAFDESH_SUPABASE_ENV` is set to a non-production value such as `local`, `development`, `test`, or `staging`.
- Production requires both `--allow-production` and `MAFDESH_ALLOW_PRODUCTION_STRESS_TEST=YES_I_REALLY_MEAN_IT`.
- Keep `SUPABASE_SERVICE_ROLE_KEY` in terminal environment variables or a backend-only env file. Never put it in frontend Vite env files.

## Run the test

```bash
SUPABASE_URL=https://your-test-project.supabase.co
SUPABASE_ANON_KEY=your_test_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_test_service_role_key
MAFDESH_SUPABASE_ENV=test
node scripts/signup-stress-test.mjs --users 100 --concurrency 5
node scripts/signup-stress-test.mjs --users 100 --concurrency 3 --signup-spacing-ms 1500
```

What it tests:

- Supabase auth signup
- `public.users` row creation
- `public.profiles` row creation when present
- login after signup
- role detection
- rate-limit-aware retries with backoff for auth signup

## Cleanup

Use the run id printed in the summary:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
MAFDESH_SUPABASE_ENV=test
node scripts/signup-stress-test.mjs --cleanup-run-id <runId>
```

## Adversarial signup checks

This repo also includes `scripts/signup-adversarial-test.mjs` for safe negative-input testing in a non-production Supabase project.

Examples:

```bash
node scripts/signup-adversarial-test.mjs
node scripts/signup-adversarial-test.mjs --signup-spacing-ms 2000
node scripts/signup-adversarial-test.mjs --cleanup-run-id <runId>
```

## Adversarial login checks

This repo also includes `scripts/login-adversarial-test.mjs` for safe login validation in a non-production Supabase project.

Examples:

```bash
node scripts/login-adversarial-test.mjs
node scripts/login-adversarial-test.mjs --login-spacing-ms 1200
node scripts/login-adversarial-test.mjs --cleanup-run-id <runId>
```

## Adversarial profile update checks

This repo also includes `scripts/profile-update-adversarial-test.mjs` for safe post-login `public.users` / `public.profiles` update validation in a non-production Supabase project.

Examples:

```bash
node scripts/profile-update-adversarial-test.mjs
node scripts/profile-update-adversarial-test.mjs --update-spacing-ms 1200
node scripts/profile-update-adversarial-test.mjs --cleanup-run-id <runId>
```

## Auth session checks

This repo also includes `scripts/auth-session-adversarial-test.mjs` for safe password-reset, refresh-token, and sign-out validation in a non-production Supabase project.

Examples:

```bash
node scripts/auth-session-adversarial-test.mjs
node scripts/auth-session-adversarial-test.mjs --step-spacing-ms 1200
node scripts/auth-session-adversarial-test.mjs --cleanup-run-id <runId>
```

## Edge Function checks

This repo also includes `scripts/edge-functions-adversarial-test.mjs` for safe malformed-payload testing against privileged Supabase Edge Functions in a non-production project.

Examples:

```bash
node scripts/edge-functions-adversarial-test.mjs
node scripts/edge-functions-adversarial-test.mjs --step-spacing-ms 1000
node scripts/edge-functions-adversarial-test.mjs --cleanup-run-id <runId>
```
