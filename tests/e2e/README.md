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
