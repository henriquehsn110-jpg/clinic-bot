/**
 * EXPLAIN ANALYZE NAS QUERIES DO DASHBOARD NO SUPABASE
 */
process.env.DOTENV_CONFIG_PATH = process.env.DOTENV_CONFIG_PATH || require('path').resolve(__dirname, '../.env.staging');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const axios = require('axios');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const clinicId = 'e8f24abe-381d-499d-9596-252507b32194';

async function runExplains() {
    console.log('================================================================');
    console.log('🔬 [PROMPT 7 - R2] EXPLAIN (ANALYZE, BUFFERS) NO SUPABASE POSTGRES');
    console.log('================================================================');

    const headers = {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/vnd.pgrst.plan+json'
    };

    try {
        // 1. Appointments Query
        console.log('\n--- 1. EXPLAIN ANALYZE: APPOINTMENTS QUERY (JOIN + ORDER BY) ---');
        const apptUrl = `${url}/rest/v1/appointments?select=*,patients(id,name,phone,cpf)&deleted_at=is.null&order=created_at.desc&offset=0&limit=50&clinic_id=eq.${clinicId}`;
        const resAppt = await axios.get(apptUrl, { headers });
        console.log(JSON.stringify(resAppt.data, null, 2));

        // 2. Patients Query
        console.log('\n--- 2. EXPLAIN ANALYZE: PATIENTS QUERY (ORDER BY + LIMIT) ---');
        const patUrl = `${url}/rest/v1/patients?select=id,name,phone,cpf,created_at&deleted_at=is.null&order=created_at.desc&offset=0&limit=50&clinic_id=eq.${clinicId}`;
        const resPat = await axios.get(patUrl, { headers });
        console.log(JSON.stringify(resPat.data, null, 2));

        // 3. Sessions Query
        console.log('\n--- 3. EXPLAIN ANALYZE: SESSIONS QUERY (FILTER BY CLINIC_ID) ---');
        const sessUrl = `${url}/rest/v1/sessions?select=id,phone,history&deleted_at=is.null&clinic_id=eq.${clinicId}`;
        const resSess = await axios.get(sessUrl, { headers });
        console.log(JSON.stringify(resSess.data, null, 2));

        // 4. Clinics Query (Middleware)
        console.log('\n--- 4. EXPLAIN ANALYZE: CLINICS QUERY (SLUG LOOKUP) ---');
        const clinicUrl = `${url}/rest/v1/clinics?select=id,name,slug,whatsapp_list_title,work_hours,address,eval_price&slug=eq.clinica-modelo`;
        const resClinic = await axios.get(clinicUrl, { headers });
        console.log(JSON.stringify(resClinic.data, null, 2));

    } catch (err) {
        console.error('❌ ERRO ao executar EXPLAIN:', err.response ? err.response.data : err.message);
    }
}

runExplains().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
