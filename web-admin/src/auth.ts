export type User = { email: string; role: 'admin' };

const KEY = 'wa_auth';

export function signIn(email: string, password: string): User | null {
  if (email.toLowerCase() === 'admin@gmail.com' && password === 'admin123') {
    const user: User = { email, role: 'admin' };
    localStorage.setItem(KEY, JSON.stringify(user));
    return user;
  }
  return null;
}

export function signOut() {
  localStorage.removeItem(KEY);
}

export function getUser(): User | null {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export function isAuthed(): boolean {
  const u = getUser();
  return !!u && u.role === 'admin';
}
