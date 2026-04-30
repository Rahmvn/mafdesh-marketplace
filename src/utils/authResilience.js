const AUTH_LOCK_RETRY_DELAYS_MS = [150, 300, 600];
const SAFE_NETWORK_RETRY_DELAYS_MS = [400, 1000, 2000];
const RETRYABLE_FETCH_TOKENS = [
  'authretryablefetcherror',
  'failed to fetch',
  'fetch failed',
  'load failed',
  'networkerror',
  'network request failed',
];
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

let authOperationQueue = Promise.resolve();

function wait(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function getErrorMessage(error) {
  return String(error?.message || error?.name || '').toLowerCase();
}

function getErrorStatus(error) {
  const rawStatus = error?.status ?? error?.statusCode ?? error?.code;
  const numericStatus = Number(rawStatus);

  return Number.isFinite(numericStatus) ? numericStatus : null;
}

function getOperationError(result) {
  return result?.error || null;
}

export function isAuthLockConflictError(error) {
  return getErrorMessage(error).includes('navigator lockmanager lock');
}

export function isRetryableFetchError(error) {
  const message = getErrorMessage(error);

  return RETRYABLE_FETCH_TOKENS.some((token) => message.includes(token));
}

export function isRetryableSupabaseError(error) {
  return isRetryableFetchError(error) || RETRYABLE_HTTP_STATUSES.has(getErrorStatus(error));
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function waitForReconnect(timeoutMs) {
  if (typeof window === 'undefined' || !isOffline()) {
    return;
  }

  await new Promise((resolve) => {
    const handleOnline = () => {
      cleanup();
      resolve();
    };

    const timerId = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const cleanup = () => {
      globalThis.clearTimeout(timerId);
      window.removeEventListener('online', handleOnline);
    };

    window.addEventListener('online', handleOnline, { once: true });
  });
}

function enqueueAuthOperation(operation) {
  const queuedOperation = authOperationQueue
    .catch(() => undefined)
    .then(operation);

  authOperationQueue = queuedOperation.catch(() => undefined);

  return queuedOperation;
}

async function executeWithRetries(operation, { includeLockRetries = false } = {}) {
  let lockAttempt = 0;
  let networkAttempt = 0;

  while (true) {
    try {
      const result = await operation();
      const operationError = getOperationError(result);

      if (!operationError) {
        return result;
      }

      if (
        includeLockRetries &&
        isAuthLockConflictError(operationError) &&
        lockAttempt < AUTH_LOCK_RETRY_DELAYS_MS.length
      ) {
        await wait(AUTH_LOCK_RETRY_DELAYS_MS[lockAttempt]);
        lockAttempt += 1;
        continue;
      }

      if (
        isRetryableSupabaseError(operationError) &&
        networkAttempt < SAFE_NETWORK_RETRY_DELAYS_MS.length
      ) {
        const retryDelay = SAFE_NETWORK_RETRY_DELAYS_MS[networkAttempt];
        networkAttempt += 1;
        await waitForReconnect(retryDelay);
        await wait(retryDelay);
        continue;
      }

      return result;
    } catch (error) {
      if (
        includeLockRetries &&
        isAuthLockConflictError(error) &&
        lockAttempt < AUTH_LOCK_RETRY_DELAYS_MS.length
      ) {
        await wait(AUTH_LOCK_RETRY_DELAYS_MS[lockAttempt]);
        lockAttempt += 1;
        continue;
      }

      if (isRetryableSupabaseError(error) && networkAttempt < SAFE_NETWORK_RETRY_DELAYS_MS.length) {
        const retryDelay = SAFE_NETWORK_RETRY_DELAYS_MS[networkAttempt];
        networkAttempt += 1;
        await waitForReconnect(retryDelay);
        await wait(retryDelay);
        continue;
      }

      throw error;
    }
  }
}

export function runAuthOperationWithRetry(operation) {
  return enqueueAuthOperation(() =>
    executeWithRetries(operation, {
      includeLockRetries: true,
    })
  );
}

export function runReadOperationWithRetry(operation) {
  return executeWithRetries(operation);
}

export function getSessionWithRetry(authClient) {
  return runAuthOperationWithRetry(() => authClient.getSession());
}

export function getUserWithRetry(authClient, jwt) {
  return runAuthOperationWithRetry(() => authClient.getUser(jwt));
}

export function refreshSessionWithRetry(authClient) {
  return runAuthOperationWithRetry(() => authClient.refreshSession());
}

export function getAuthFeedback(actionLabel, error) {
  if (!supabaseUrl) {
    return {
      title: 'Authentication Unavailable',
      message:
        'Secure authentication is temporarily unavailable because the app auth configuration is missing.',
    };
  }

  if (isOffline()) {
    return {
      title: 'No Internet Connection',
      message: `You're offline right now. Reconnect to the internet and try to ${actionLabel} again.`,
    };
  }

  if (isAuthLockConflictError(error)) {
    return {
      title: `${capitalizeAction(actionLabel)} Delayed`,
      message:
        'Another authentication request was still finishing. Please try again, and if it keeps happening close other Mafdesh tabs first.',
    };
  }

  if (isRetryableSupabaseError(error)) {
    return {
      title: 'Connection Problem',
      message: `We could not reach secure ${actionLabel}. We retried automatically, but the connection is still unstable or being blocked. Please check the internet connection, VPN, firewall, or ad blocker and try again.`,
    };
  }

  return {
    title: `${capitalizeAction(actionLabel)} Failed`,
    message: error?.message || `We could not ${actionLabel}. Please try again.`,
  };
}

function capitalizeAction(value) {
  const normalizedValue = String(value || '').trim();

  if (!normalizedValue) {
    return 'Action';
  }

  return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}
