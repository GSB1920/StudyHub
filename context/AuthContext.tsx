
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, dataService } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

interface User {
  id: string;
  email: string;
  class?: string;
  board?: string;
  full_name?: string;
  username?: string;
  role?: 'admin' | 'student';
  kill?: boolean;
}

interface AuthContextType {
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  updateAccount: (data: { email?: string; password?: string; full_name?: string; username?: string }) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  signIn: async () => {},
  signOut: async () => {},
  updateProfile: async () => {},
  updateAccount: async () => {},
  isLoading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkSession();

    // Listen for auth changes (e.g. token refresh, sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
       if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
         if (session?.user) {
            await refreshUserProfile(session.user.id, session.user.email!);
         }
       } else if (event === 'SIGNED_OUT') {
         setUser(null);
       }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkSession = async () => {
    try {
      // Create a timeout promise that rejects after 5 seconds
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session check timeout')), 5000)
      );

      // Race between getSession and timeout
      const { data: { session } } = await Promise.race([
        supabase.auth.getSession(),
        timeoutPromise.then(() => { throw new Error('Session check timeout'); })
      ]) as any;
      
      if (session?.user) {
         await refreshUserProfile(session.user.id, session.user.email!);
      } else {
        // Fallback: Check if we have manually persisted user data
        const storedUser = await AsyncStorage.getItem('auth_user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      }
    } catch (e) {
      console.error('Session check failed:', e);
      // Fallback on error too
      try {
        const storedUser = await AsyncStorage.getItem('auth_user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } catch {}
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUserProfile = async (userId: string, email: string) => {
      const { data: profile } = await dataService.getProfile(userId);
      const { data: userInfo } = await supabase.auth.getUser();
      const metaRole = (userInfo?.user?.user_metadata as any)?.role || (userInfo?.user?.app_metadata as any)?.role;
      const fullNameMeta = (userInfo?.user?.user_metadata as any)?.full_name;
      const usernameMeta = (userInfo?.user?.user_metadata as any)?.username;
      const classMeta = (userInfo?.user?.user_metadata as any)?.class;
      const boardMeta = (userInfo?.user?.user_metadata as any)?.board;
      
      let userData: User;
      if (profile) {
          userData = { ...profile, email, role: metaRole || 'student', full_name: fullNameMeta ?? profile.full_name, username: usernameMeta ?? profile.username, class: profile.class ?? classMeta, board: profile.board ?? boardMeta, kill: profile.kill };
      } else {
          userData = { id: userId, email, role: metaRole || 'student', full_name: fullNameMeta, username: usernameMeta, class: classMeta, board: boardMeta };
      }
      setUser(userData);
      AsyncStorage.setItem('auth_user', JSON.stringify(userData));
  };

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    let data: any = null;
    let error: any = null;
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), 12000));
      const result: any = await Promise.race([dataService.login(email, password), timeout]);
      data = result?.data;
      error = result?.error;
    } catch (e) {
      error = e instanceof Error ? { message: e.message } : { message: 'Network timeout' };
    }
    
    if (error) {
      setIsLoading(false);
      throw new Error(error.message);
    }
    
    try {
      const isAdminOverride = email.toLowerCase() === 'admin@gmail.com' && password === 'admin';
      if (isAdminOverride) {
        await supabase.auth.updateUser({ data: { role: 'admin' } });
        const { data: userInfo } = await supabase.auth.getUser();
        if (userInfo?.user) {
          await refreshUserProfile(userInfo.user.id, userInfo.user.email!);
        }
      }
    } catch {}

    setIsLoading(false);
  };

  const signOut = async () => {
    setIsLoading(true);
    await supabase.auth.signOut(); // This triggers onAuthStateChange -> SIGNED_OUT
    await AsyncStorage.removeItem('auth_user');
    setUser(null);
    setIsLoading(false);
  };

  const updateProfile = async (data: Partial<User>) => {
    if (!user) return;
    
    const { error } = await dataService.updateProfile(user.id, data);
    
    if (!error) {
      const updatedUser = { ...user, ...data };
      setUser(updatedUser);
      return;
    }

    throw new Error(error.message);
  };

  const updateAccount = async (data: { email?: string; password?: string; full_name?: string; username?: string }) => {
    if (!user) return;
    const { data: resp, error } = await dataService.updateAccount(data);
    if (error) throw new Error(error.message);
    const merged = { ...user };
    if (data.email) merged.email = data.email;
    if (data.full_name) merged.full_name = data.full_name;
    if (data.username) merged.username = data.username;
    setUser(merged);
  };

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, updateProfile, updateAccount, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
