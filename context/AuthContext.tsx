
import React, { createContext, useContext, useState, useEffect } from 'react';
import { account, dataService } from '../lib/appwrite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Models } from 'react-native-appwrite';

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
  }, []);

  const checkSession = async () => {
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session check timeout')), 5000)
      );

      // Race between getSession and timeout
      const result: any = await Promise.race([
        dataService.getCurrentUser(),
        timeoutPromise.then(() => { throw new Error('Session check timeout'); })
      ]);
      
      const sessionUser = result.data;

      if (sessionUser) {
         await refreshUserProfile(sessionUser.$id, sessionUser.email);
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
      const { data: accountUser } = await dataService.getCurrentUser();
      
      const prefs = (accountUser?.prefs ?? {}) as { role?: 'admin' | 'student'; username?: string };
      const metaRole = prefs.role;
      const usernameMeta = prefs.username;
      const prefsClass = (accountUser?.prefs as any)?.class;
      const prefsBoard = (accountUser?.prefs as any)?.board;
      const prefsKill = (accountUser?.prefs as any)?.kill;
      
      let userData: User;
      if (profile) {
          userData = { 
              ...profile, 
              email, 
              role: metaRole || 'student', 
              full_name: accountUser?.name || profile.full_name, 
              username: usernameMeta || profile.username, 
              class: profile.class ?? prefsClass, 
              board: profile.board ?? prefsBoard, 
              kill: profile.kill ?? prefsKill 
          };
      } else {
          userData = { 
              id: userId, 
              email, 
              role: metaRole || 'student', 
              full_name: accountUser?.name, 
              username: usernameMeta,
              class: prefsClass,
              board: prefsBoard,
              kill: prefsKill
          };
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
        // Update prefs instead of user_metadata
        await account.updatePrefs({ role: 'admin' });
      }
      
      const { data: userInfo } = await dataService.getCurrentUser();
      if (userInfo) {
          await refreshUserProfile(userInfo.$id, userInfo.email);
      }
    } catch (e) {
        console.log('Error refreshing profile after login', e);
    }

    setIsLoading(false);
  };

  const signOut = async () => {
    setIsLoading(true);
    await dataService.logout();
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
      // Update local storage as well to keep it in sync
      AsyncStorage.setItem('auth_user', JSON.stringify(updatedUser));
      return;
    }

    throw new Error(error.message);
  };

  const updateAccount = async (data: { email?: string; password?: string; full_name?: string; username?: string; old_password?: string }) => {
    if (!user) return;
    const { data: resp, error } = await dataService.updateAccount(data);
    if (error) throw new Error(error.message);
    
    const merged = { ...user };
    if (data.email) merged.email = data.email;
    if (data.full_name) merged.full_name = data.full_name;
    if (data.username) merged.username = data.username;
    
    setUser(merged);
    AsyncStorage.setItem('auth_user', JSON.stringify(merged));
  };

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, updateProfile, updateAccount, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
