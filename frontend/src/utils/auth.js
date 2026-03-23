const TOKEN_KEY = 'boardmate_access_token';
const USER_KEY = 'boardmate_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getToken());
}

export function setSession(authResponse) {
  localStorage.setItem(TOKEN_KEY, authResponse.access_token);
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      user_id: authResponse.user_id,
      full_name: authResponse.full_name,
      email: authResponse.email,
    }),
  );
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
