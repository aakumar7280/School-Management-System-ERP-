import { AuthSession } from './types';

const SESSION_KEY = 'school_erp_session';

interface StoredSession {
  session: AuthSession;
}

export function saveSession(session: AuthSession) {
  const payload: StoredSession = { session };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function getSession(): AuthSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredSession | AuthSession;
    const isStoredSession =
      typeof parsed === 'object' &&
      parsed !== null &&
      'session' in parsed;

    if (isStoredSession) return (parsed as StoredSession).session;

    return parsed as AuthSession;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
