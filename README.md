# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Payment Function Secrets

The Supabase edge functions expect these secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY` or `PAYSTACK_SECRET` for live Paystack verification

For the frontend app, use:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`VITE_SUPABASE_PUBLISHABLE_KEY` is still accepted as a fallback for older local setups.

For test-mode checkout, set:

- `MOCK_PAYMENT=true`

Example:

```powershell
supabase secrets set MOCK_PAYMENT=true
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxxxx
```

## Auth Callback Settings

Set Supabase Auth to use the shared callback route so email confirmation and password recovery
return through the app's recovery flow:

- Site URL: your deployed app URL
- Additional redirect URLs:
  - `http://127.0.0.1:5173/auth/callback`
  - `http://localhost:5173/auth/callback`
  - `http://127.0.0.1:4173/auth/callback`
  - your production `/auth/callback` URL

The auth hardening flow also expects these backend secrets for authenticated recovery/bootstrap:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
