/**
 * Safely parse a JSON value from localStorage.
 * Returns null if the key is missing, the value is invalid JSON,
 * or any other error occurs.
 */
export function getStoredUser() {
  try {
    const raw = localStorage.getItem('mafdesh_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || !parsed.id || !parsed.role) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  try {
    if (!user) {
      localStorage.removeItem('mafdesh_user');
      return;
    }

    localStorage.setItem('mafdesh_user', JSON.stringify(user));
  } catch {
    console.warn('[Mafdesh] Could not save user to localStorage');
  }
}

export function clearStoredUser() {
  try {
    localStorage.removeItem('mafdesh_user');
  } catch {
    // ignore
  }
}

export function safeParseJSON(value, fallback = null) {
  try {
    if (!value) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
