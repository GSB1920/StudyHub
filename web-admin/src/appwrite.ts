import { Client, Account, Databases, Storage } from 'appwrite';

const client = new Client();

const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const RAW_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID || '';
const PROJECT_ID = RAW_PROJECT_ID && RAW_PROJECT_ID !== 'replace_with_project_id' ? RAW_PROJECT_ID : '';
export const APPWRITE_INIT_ERROR = PROJECT_ID
    ? null
    : 'Missing VITE_APPWRITE_PROJECT_ID. Set Appwrite env vars and rebuild.';

client.setEndpoint(ENDPOINT);
if (PROJECT_ID) {
    client.setProject(PROJECT_ID);
}

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

export const APPWRITE_CONFIG = {
    DATABASE_ID: import.meta.env.VITE_APPWRITE_DATABASE_ID || 'study_hub_db',
    COLLECTIONS: {
        SUBJECTS: import.meta.env.VITE_APPWRITE_COLLECTION_SUBJECTS || 'subjects',
        SECTIONS: import.meta.env.VITE_APPWRITE_COLLECTION_SECTIONS || 'sections',
        MATERIALS: import.meta.env.VITE_APPWRITE_COLLECTION_MATERIALS || 'materials',
        PROFILES: import.meta.env.VITE_APPWRITE_COLLECTION_PROFILES || 'profiles',
    },
    BUCKETS: {
        MATERIALS: import.meta.env.VITE_APPWRITE_BUCKET_MATERIALS || 'materials_bucket',
    }
};

export { client };
