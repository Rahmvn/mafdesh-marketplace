Run browser smoke tests with:

```bash
npm run test:e2e
```

If Playwright reports that Chromium is missing, install it with:

```bash
npx playwright install chromium
```

Current smoke coverage:

- `/login` renders
- `/terms` renders
- `/support` redirects unauthenticated users to `/login`
- `/admin/users` redirects unauthenticated users to `/login`

Optional live auth smoke:

- Set `E2E_AUTH_EMAIL_BUYER` and `E2E_AUTH_PASSWORD_BUYER`
- Set `E2E_AUTH_EMAIL_SELLER` and `E2E_AUTH_PASSWORD_SELLER`
- Set `E2E_AUTH_EMAIL_ADMIN` and `E2E_AUTH_PASSWORD_ADMIN`
- Run `npx playwright test tests/e2e/auth.spec.js`
- Coverage includes buyer, seller, and admin login, protected-route return flow, and admin-route redirect fallback for non-admin users
