import { account, APPWRITE_INIT_ERROR } from './appwrite';
import { Models } from 'appwrite';

export type User = Models.User<Models.Preferences>;

export async function signIn(
  email: string,
  password: string
): Promise<{ user: User | null; error: string | null }> {
  if (APPWRITE_INIT_ERROR) {
    return { user: null, error: APPWRITE_INIT_ERROR };
  }
  try {
    await account.createEmailPasswordSession(email, password);
    const user = await account.get();
    return { user, error: null };
  } catch (e: any) {
    let message = typeof e?.message === 'string' && e.message.length > 0 ? e.message : 'Sign in failed';
    if (e?.type === 'general_unauthorized_scope') {
      message = 'Sign in blocked by Appwrite settings. Add this origin to Appwrite Web platform and verify project ID.';
    } else if (e?.type === 'user_invalid_credentials') {
      message = 'Invalid email or password for this Appwrite project.';
    }
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
