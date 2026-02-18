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
  console.log('--- DIAGNOSTIC CHECK ---');
  
  // 1. Check 'sections' table
  console.log('\n1. Checking "sections" table...');
  const { data: sectionsData, error: sectionsError } = await supabase.from('sections').select('*').limit(1);
  if (sectionsError) {
    console.log(`❌ Error: ${sectionsError.message} (Code: ${sectionsError.code})`);
  } else {
    console.log('✅ Table "sections" exists.');
  }

  // 2. Check 'materials' table columns by trying to select them
  console.log('\n2. Checking "materials" table columns...');
  
  // Check 'category' column
  const { error: catError } = await supabase.from('materials').select('category').limit(1);
  if (catError) {
    console.log(`❌ Column "category" access failed: ${catError.message}`);
  } else {
    console.log('✅ Column "category" exists.');
  }

  // Check 'section_id' column
  const { error: secIdError } = await supabase.from('materials').select('section_id').limit(1);
  if (secIdError) {
    console.log(`❌ Column "section_id" access failed: ${secIdError.message}`);
  } else {
    console.log('✅ Column "section_id" exists.');
  }

  console.log('\n--- END DIAGNOSTIC ---');
})();
