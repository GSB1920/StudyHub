const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env manually
const envPath = path.join(__dirname, '../web-admin/.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    let value = parts.slice(1).join('=').trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

(async () => {
  const idToDelete = '99ee1eed-08e3-4ff1-bf55-c065e0371f0a'; // Mathematics (CBSE)
  console.log(`Deleting duplicate subject: ${idToDelete}...`);
  
  const { error } = await supabase.from('subjects').delete().eq('id', idToDelete);
  
  if (error) {
    console.error('Error deleting subject:', error);
  } else {
    console.log('Subject deleted successfully.');
  }
})();
