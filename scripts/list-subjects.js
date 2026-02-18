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
  console.log('Fetching subjects for class 8th...');
  const { data, error } = await supabase.from('subjects').select('*').eq('class', '8th');
  if (error) {
    console.error('Error fetching subjects:', error);
  } else {
    console.log(JSON.stringify(data, null, 2));
    
    // Check for duplicates
    const duplicates = data.filter(s => s.name.toLowerCase().includes('math'));
    console.log('Math subjects found:', duplicates.map(s => `${s.name} (${s.id})`));
  }
})();
