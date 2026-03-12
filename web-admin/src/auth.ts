import { account } from './appwrite';
import { Models } from 'appwrite';

export type User = Models.User<Models.Preferences>;

export async function signIn(
  email: string,
  password: string
): Promise<{ user: User | null; error: string | null }> {
  try {
    await account.createEmailPasswordSession(email, password);
    const user = await account.get();
    return { user, error: null };
  } catch (e: any) {
    const message = typeof e?.message === 'string' && e.message.length > 0 ? e.message : 'Sign in failed';
    console.error(e);
    return { user: null, error: message };
  }
}

export async function signOut() {
  try {
    await account.deleteSession('current');
  } catch (e) {
    console.error(e);
  }
}

export async function getUser(): Promise<User | null> {
  try {
    const user = await account.get();
    return user;
  } catch {
    return null;
  }
}
