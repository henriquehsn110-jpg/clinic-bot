require('dotenv').config();
const {createClient} = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
sb.from('appointments').select().then(res => console.log(res.data));
