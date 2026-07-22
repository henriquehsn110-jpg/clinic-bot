require('dotenv').config();
const { cleanEnvVar } = require('./services/databaseService');
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = cleanEnvVar(process.env.SUPABASE_URL);
const supabaseKey = cleanEnvVar(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
const sb = createClient(supabaseUrl, supabaseKey);
sb.from('appointments').select('*').then(res => {
    if (res.error) console.error('DB Check Error:', res.error);
    else console.log(`DB Check Success: Retrieved ${res.data ? res.data.length : 0} appointment records.`);
});
