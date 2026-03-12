import { Client, Account, Databases, Storage, ID, Query } from 'react-native-appwrite';

const client = new Client();

const ENDPOINT = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const PROJECT_ID = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID || 'replace_with_project_id';
const DATABASE_ID = process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID || 'study_hub_db';

client
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setPlatform('com.studyhub.app');

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

export const APPWRITE_CONFIG = {
    DATABASE_ID,
    COLLECTIONS: {
        SUBJECTS: process.env.EXPO_PUBLIC_COLLECTION_SUBJECTS || 'subjects',
        SECTIONS: process.env.EXPO_PUBLIC_COLLECTION_SECTIONS || 'sections',
        MATERIALS: process.env.EXPO_PUBLIC_COLLECTION_MATERIALS || 'materials',
        PROFILES: process.env.EXPO_PUBLIC_COLLECTION_PROFILES || 'profiles',
        USER_PROGRESS: process.env.EXPO_PUBLIC_COLLECTION_USER_PROGRESS || 'user_progress',
    },
    BUCKETS: {
        MATERIALS: process.env.EXPO_PUBLIC_BUCKET_MATERIALS || 'materials_bucket',
    }
};

const mapDoc = (doc: any) => ({ ...doc, id: doc.$id });

export const dataService = {
  login: async (email: string, password: string) => {
    try {
      // Appwrite throws if session already exists, so we might want to delete it first or catch error
      // But typically we just try to create session
      return { data: await account.createEmailPasswordSession(email, password), error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  },

  signup: async (email: string, password: string, fullName: string) => {
    try {
      const user = await account.create(ID.unique(), email, password, fullName);
      // Auto login after signup
      await account.createEmailPasswordSession(email, password);
      return { data: user, error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  },

  oauth: async (provider: string) => {
    try {
        // OAuth in RN Appwrite SDK requires deep linking handling
        // account.createOAuth2Session(provider, 'studyhub://auth/callback');
        // This usually opens a browser.
        // For now, we'll return a placeholder or error if not fully implemented
        return { data: null, error: { message: "OAuth not fully implemented in migration yet" } };
    } catch (e: any) {
        return { data: null, error: e };
    }
  },

  resetPassword: async (email: string) => {
    try {
        await account.createRecovery(email, 'studyhub://auth/reset');
        return { data: true, error: null };
    } catch (e: any) {
        return { data: null, error: e };
    }
  },

  logout: async () => {
      try {
          await account.deleteSession('current');
          return { error: null };
      } catch (e: any) {
          return { error: e };
      }
  },

  getCurrentUser: async () => {
      try {
          const user = await account.get();
          return { data: user, error: null };
      } catch (e: any) {
          return { data: null, error: e };
      }
  },

  uploadMaterialFile: async (subjectId: string, uri: string, name: string, contentType: string) => {
    try {
      // React Native Appwrite Storage upload needs a file object with uri, name, type
      const file = {
          uri: uri,
          name: name,
          type: contentType,
      };

      const fileId = ID.unique();
      await storage.createFile(APPWRITE_CONFIG.BUCKETS.MATERIALS, fileId, file as any);
      
      const url = storage.getFileDownload(APPWRITE_CONFIG.BUCKETS.MATERIALS, fileId).href;
      return { url, error: null };
    } catch (e: any) {
      return { url: null, error: { message: e?.message || 'Upload failed' } };
    }
  },

  updateAccount: async (data: { email?: string; password?: string; full_name?: string; username?: string }) => {
    try {
        if (data.email) await account.updateEmail(data.email, ''); // password required for email update usually
        if (data.password) await account.updatePassword(data.password);
        if (data.full_name) await account.updateName(data.full_name);
        if (data.username) {
            // Appwrite doesn't have "username" in base account, stored in prefs or db
            await account.updatePrefs({ username: data.username });
        }
        return { data: await account.get(), error: null };
    } catch (e: any) {
        return { data: null, error: e };
    }
  },

  updateProfile: async (userId: string, data: any) => {
    try {
        // We can use Account Prefs or a separate Collection 'profiles'
        // Using Collection 'profiles' to match Supabase architecture
        // Check if profile exists
        try {
            await databases.updateDocument(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTIONS.PROFILES, userId, data);
        } catch (e: any) {
            if (e.code === 404) {
                await databases.createDocument(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTIONS.PROFILES, userId, data);
            } else {
                throw e;
            }
        }
        
        // Also update account name if provided
        if (data.full_name) await account.updateName(data.full_name);
        
        return { data, error: null };
    } catch (e: any) {
        return { data: null, error: e };
    }
  },

  getProfile: async (userId: string) => {
    try {
        const doc = await databases.getDocument(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTIONS.PROFILES, userId);
        return { data: mapDoc(doc), error: null };
    } catch (e: any) {
        return { data: null, error: e };
    }
  },

  getSubjects: async (klass?: string, board?: string) => {
    try {
        const queries = [];
        if (klass) queries.push(Query.equal('class', klass));
        if (board) queries.push(Query.equal('board', board));
        
        const response = await databases.listDocuments(
            APPWRITE_CONFIG.DATABASE_ID, 
            APPWRITE_CONFIG.COLLECTIONS.SUBJECTS, 
            queries
        );
        return { data: response.documents.map(mapDoc), error: null };
    } catch (e: any) {
        return { data: [], error: e };
    }
  },

  getMaterials: async (subjectId: string) => {
    try {
        const response = await databases.listDocuments(
            APPWRITE_CONFIG.DATABASE_ID, 
            APPWRITE_CONFIG.COLLECTIONS.MATERIALS, 
            [
                Query.equal('subject_id', subjectId),
                Query.orderAsc('title') // created_at not always available for sort if not indexed
            ]
        );
        // We need to fetch section names if needed, but for now just return materials
        // The original code joined sections. Appwrite doesn't do joins easily.
        // We might need to fetch sections separately or store section_name in material.
        // For migration speed, we'll assume section_id is enough or UI handles it.
        // Actually the UI uses `section:section_id(name)`.
        // We can manually fetch sections and map them.
        
        const materials = response.documents.map(mapDoc);
        
        // Fetch sections for these materials
        const sectionIds = [...new Set(materials.map((m: any) => m.section_id).filter(Boolean))];
        if (sectionIds.length > 0) {
            // Appwrite doesn't support "IN" query for array of IDs easily in one go efficiently without limit
            // But we can fetch all sections for the subject
             const secResponse = await databases.listDocuments(
                APPWRITE_CONFIG.DATABASE_ID, 
                APPWRITE_CONFIG.COLLECTIONS.SECTIONS, 
                [Query.equal('subject_id', subjectId)]
            );
            const sectionsMap = secResponse.documents.reduce((acc: any, sec: any) => {
                acc[sec.$id] = sec;
                return acc;
            }, {});
            
            materials.forEach((m: any) => {
                if (m.section_id && sectionsMap[m.section_id]) {
                    m.section = { name: sectionsMap[m.section_id].name };
                }
            });
        }
        
        return { data: materials, error: null };
    } catch (e: any) {
        return { data: [], error: e };
    }
  },

  adminGetSubjects: async (klass: string, board: string) => {
     // Reusing getSubjects
     return await dataService.getSubjects(klass, board);
  },

  adminAddSubject: async (klass: string, board: string, name: string, icon: string) => {
    try {
        const doc = await databases.createDocument(
            APPWRITE_CONFIG.DATABASE_ID,
            APPWRITE_CONFIG.COLLECTIONS.SUBJECTS,
            ID.unique(),
            { name, icon, class: klass, board }
        );
        return { data: mapDoc(doc), error: null };
    } catch (e: any) {
        return { data: null, error: e };
    }
  },

  adminGetMaterials: async (subjectId: string) => {
      // Reusing getMaterials
      return await dataService.getMaterials(subjectId);
  },

  adminAddMaterial: async (subjectId: string, title: string, type: 'pdf' | 'test' | 'sheet', url: string) => {
    try {
        const doc = await databases.createDocument(
            APPWRITE_CONFIG.DATABASE_ID,
            APPWRITE_CONFIG.COLLECTIONS.MATERIALS,
            ID.unique(),
            { subject_id: subjectId, title, type, url }
        );
        return { data: mapDoc(doc), error: null };
    } catch (e: any) {
        return { data: null, error: e };
    }
  },

  updateProgress: async (userId: string, materialId: string, status: string = 'started', progress: number = 0) => {
    try {
        // Appwrite doesn't have UPSERT. We must check if exists.
        // Or we can try to create, if fails (conflict), update.
        // Since we don't have a deterministic ID for progress (unless we make one),
        // we should query first.
        const list = await databases.listDocuments(
            APPWRITE_CONFIG.DATABASE_ID,
            APPWRITE_CONFIG.COLLECTIONS.USER_PROGRESS,
            [Query.equal('user_id', userId), Query.equal('material_id', materialId)]
        );
        
        let doc;
        const data = { user_id: userId, material_id: materialId, status, progress, last_accessed: new Date().toISOString() };
        
        if (list.documents.length > 0) {
            doc = await databases.updateDocument(
                APPWRITE_CONFIG.DATABASE_ID,
                APPWRITE_CONFIG.COLLECTIONS.USER_PROGRESS,
                list.documents[0].$id,
                data
            );
        } else {
            doc = await databases.createDocument(
                APPWRITE_CONFIG.DATABASE_ID,
                APPWRITE_CONFIG.COLLECTIONS.USER_PROGRESS,
                ID.unique(),
                data
            );
        }
        return { data: mapDoc(doc), error: null };
    } catch (e: any) {
        return { data: null, error: e };
    }
  },

  getProgress: async (userId: string, materialId: string) => {
    try {
        const list = await databases.listDocuments(
            APPWRITE_CONFIG.DATABASE_ID,
            APPWRITE_CONFIG.COLLECTIONS.USER_PROGRESS,
            [Query.equal('user_id', userId), Query.equal('material_id', materialId)]
        );
        if (list.documents.length > 0) {
            return { data: mapDoc(list.documents[0]), error: null };
        }
        return { data: null, error: { message: 'Not found', code: 404 } };
    } catch (e: any) {
        return { data: null, error: e };
    }
  },

  getRecentMaterials: async (userId: string) => {
    try {
        const list = await databases.listDocuments(
            APPWRITE_CONFIG.DATABASE_ID,
            APPWRITE_CONFIG.COLLECTIONS.USER_PROGRESS,
            [
                Query.equal('user_id', userId),
                Query.orderDesc('last_accessed'),
                Query.limit(5)
            ]
        );
        // Need to fetch materials for these progress items
        const progressItems = list.documents.map(mapDoc);
        
        // Fetch materials
        // Optimization: fetch all materials by IDs if possible, or one by one
        // Appwrite supports equal('attribute', [value1, value2]) for "IN" query in newer versions
        // We'll assume one by one for safety or use Promise.all
        const enriched = await Promise.all(progressItems.map(async (item: any) => {
            try {
                const matDoc = await databases.getDocument(APPWRITE_CONFIG.DATABASE_ID, APPWRITE_CONFIG.COLLECTIONS.MATERIALS, item.material_id);
                return { ...item, material: mapDoc(matDoc) };
            } catch {
                return item;
            }
        }));
        
        return { data: enriched, error: null };
    } catch (e: any) {
        return { data: [], error: e };
    }
  }
};
