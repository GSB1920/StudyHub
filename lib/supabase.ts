
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as FileSystem from 'expo-file-system';

// Use environment variables for Supabase configuration
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xyzcompany.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Unified Service using Supabase backend
export const dataService = {
  login: async (email, password) => {
    return await supabase.auth.signInWithPassword({ email, password });
  },

  signup: async (email, password, fullName) => {
    return await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: {
          full_name: fullName,
        },
        // Disable email confirmation if enabled in Supabase settings,
        // but this flag only works if "Enable email confirmations" is OFF in Supabase dashboard.
        // However, standard practice to auto-confirm is usually server-side setting.
        // We will assume the project settings allow signups without verification or we handle it.
      }
    });
  },

  oauth: async (provider) => {
    return await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: 'studyhub://auth/callback' },
    });
  },

  resetPassword: async (email) => {
    return await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'studyhub://auth/reset',
    });
  },

  uploadMaterialFile: async (subjectId: string, uri: string, name: string, contentType: string) => {
    try {
      const blob = await (await fetch(uri)).blob();
      const path = `${subjectId}/${Date.now()}_${name}`;
      const { error } = await supabase.storage.from('materials').upload(path, blob, { contentType, upsert: true });
      if (error) return { url: null, error };
      const { data: pub } = supabase.storage.from('materials').getPublicUrl(path);
      return { url: pub.publicUrl, error: null };
    } catch (e: any) {
      return { url: null, error: { message: e?.message || 'Upload failed' } };
    }
  },

  updateAccount: async (data: { email?: string; password?: string; full_name?: string; username?: string }) => {
    const payload: any = {};
    if (data.email) payload.email = data.email;
    if (data.password) payload.password = data.password;
    const meta: any = {};
    if (data.full_name) meta.full_name = data.full_name;
    if (data.username) meta.username = data.username;
    if (Object.keys(meta).length) payload.data = meta;
    return await supabase.auth.updateUser(payload);
  },

  updateProfile: async (userId, data) => {
    const meta: any = {};
    if (data.class) meta.class = data.class;
    if (data.board) meta.board = data.board;
    if (data.full_name) meta.full_name = data.full_name;
    if (data.username) meta.username = data.username;
    const { error: metaError } = await supabase.auth.updateUser({ data: meta });
    try {
      await supabase.from('profiles').upsert({ id: userId, ...data }, { onConflict: 'id' });
    } catch {}
    return { data, error: metaError || null };
  },

  getProfile: async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    return { data, error };
  },

  getSubjects: async (klass?: string, board?: string) => {
    let query = supabase.from('subjects').select('*');
    if (klass) query = query.eq('class', klass);
    if (board) query = query.eq('board', board);
    const { data, error } = await query;
    return { data: data || [], error };
  },

  getMaterials: async (subjectId) => {
    const { data, error } = await supabase
      .from('materials')
      .select('*, section:section_id(name)')
      .eq('subject_id', subjectId)
      .order('created_at');
    
    // Map the nested section object to a simpler structure if needed, 
    // but the frontend handles `m.section?.name`.
    // Note: Supabase returns single object for foreign key if relationship is one-to-many? 
    // Yes, materials belongs to section. So section is singular.
    
    // We also need to fetch sections separately if we want to show empty sections?
    // Current mobile UI only shows sections with materials. That is fine.
    
    return { data: data || [], error };
  },

  adminGetSubjects: async (klass: string, board: string) => {
    const { data, error } = await supabase.from('subjects').select('*').ilike('class', klass).ilike('board', board);
    return { data: data || [], error };
  },

  adminAddSubject: async (klass: string, board: string, name: string, icon: string) => {
    let { data, error } = await supabase.from('subjects').insert({ name, icon, class: klass, board }).select().single();
    if (error && (error.message?.includes('column') || error.message?.includes('does not exist'))) {
      ({ data, error } = await supabase.from('subjects').insert({ name, icon }).select().single());
    }
    return { data, error };
  },

  adminGetMaterials: async (subjectId: string) => {
    const { data, error } = await supabase.from('materials').select('*').eq('subject_id', subjectId);
    return { data: data || [], error };
  },

  adminAddMaterial: async (subjectId: string, title: string, type: 'pdf' | 'test' | 'sheet', url: string) => {
    const { data, error } = await supabase.from('materials').insert({ subject_id: subjectId, title, type, url }).select().single();
    return { data, error };
  },

  updateProgress: async (userId: string, materialId: string, status: string = 'started', progress: number = 0) => {
    // Upsert progress
    const { data, error } = await supabase.from('user_progress').upsert(
      { user_id: userId, material_id: materialId, status, progress, last_accessed: new Date().toISOString() },
      { onConflict: 'user_id, material_id' }
    ).select().single();
    return { data, error };
  },

  getProgress: async (userId: string, materialId: string) => {
    const { data, error } = await supabase
      .from('user_progress')
      .select('progress, status')
      .eq('user_id', userId)
      .eq('material_id', materialId)
      .single();
    return { data, error };
  },

  getRecentMaterials: async (userId: string) => {
    const { data, error } = await supabase
      .from('user_progress')
      .select('*, material:material_id(*)')
      .eq('user_id', userId)
      .order('last_accessed', { ascending: false })
      .limit(5);
    return { data: data || [], error };
  }
};
