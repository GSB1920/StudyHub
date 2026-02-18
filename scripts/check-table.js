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
  console.log('Checking if "sections" table exists...');
  const { data, error } = await supabase.from('sections').select('*').limit(1);
  
  if (error) {
    console.error('Error accessing "sections" table:', error);
    if (error.code === '404' || error.message.includes('404') || error.status === 404) {
      console.log('\nCONFIRMED: Table "sections" does not exist.');
    }
  } else {
    console.log('Table "sections" exists and is accessible.');
  }
})();
