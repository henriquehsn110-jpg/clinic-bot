const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../clinic-bot-backend/.env') });
const { cleanEnvVar } = require('../../clinic-bot-backend/services/databaseService');
const { createClient } = require('@supabase/supabase-js');

console.log("=== EMPIRICAL EDGE CASE TESTING: cleanEnvVar ===");

const testCases = [
    { input: undefined, expected: '' },
    { input: null, expected: '' },
    { input: '', expected: '' },
    { input: '   ', expected: '' },
    { input: '"https://example.supabase.co"', expected: 'https://example.supabase.co' },
    { input: "'https://example.supabase.co'", expected: 'https://example.supabase.co' },
    { input: "`https://example.supabase.co`", expected: 'https://example.supabase.co' },
    { input: ' " \' ` https://example.supabase.co ` \' " ', expected: 'https://example.supabase.co' },
    { input: '"  https://example.supabase.co  "', expected: 'https://example.supabase.co' },
    { input: "' \t\n https://example.supabase.co \r\n '", expected: 'https://example.supabase.co' },
    { input: '"""\'\'\'```https://example.supabase.co```\'\'\'"""', expected: 'https://example.supabase.co' },
    { input: '"\"\'sb_secret_key_123\'\""', expected: 'sb_secret_key_123' },
    { input: ' " \t  sb_service_role_key_456 \n " ', expected: 'sb_service_role_key_456' },
    { input: '"asymmetric_start\'', expected: 'asymmetric_start' },
    { input: '\'asymmetric_end"', expected: 'asymmetric_end' },
    { input: '"string with internal spaces"', expected: 'string with internal spaces' },
    { input: '"""', expected: '' },
    { input: '" \' ` ` \' "', expected: '' },
    { input: 'https://example.supabase.co?token="123"', expected: 'https://example.supabase.co?token="123"' },
];

let passedCount = 0;
let failedCount = 0;

testCases.forEach((tc, idx) => {
    const result = cleanEnvVar(tc.input);
    const pass = result === tc.expected;
    if (pass) {
        passedCount++;
        console.log(`[PASS] Case #${idx+1}: input=${JSON.stringify(tc.input)} => ${JSON.stringify(result)}`);
    } else {
        failedCount++;
        console.error(`[FAIL] Case #${idx+1}: input=${JSON.stringify(tc.input)} => ${JSON.stringify(result)} (Expected: ${JSON.stringify(tc.expected)})`);
    }
});

console.log(`\ncleanEnvVar Edge Cases: ${passedCount} passed, ${failedCount} failed.`);

// Test live DB connection with extreme quoted env vars
console.log("\n=== EMPIRICAL EDGE CASE TESTING: Live Database Connection with Extreme Quoted Env Vars ===");

const rawUrl = process.env.SUPABASE_URL;
const rawKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!rawUrl || !rawKey) {
    console.error("CRITICAL: SUPABASE_URL or SUPABASE_SERVICE_KEY missing in .env!");
    process.exit(1);
}

// Wrap real credentials in extreme quotes, tabs, spaces, newlines
const extremeUrl = `  \t\n  " ' \` "${rawUrl}" \` ' " \t\n  `;
const extremeKey = `  \r\n  ' " \` '${rawKey}' \` " ' \r\n  `;

const cleanedUrl = cleanEnvVar(extremeUrl);
const cleanedKey = cleanEnvVar(extremeKey);

console.log("Extreme URL cleaned matches raw:", cleanedUrl === rawUrl.trim());
console.log("Extreme Key cleaned matches raw:", cleanedKey === rawKey.trim());

const sbClient = createClient(cleanedUrl, cleanedKey);

sbClient.from('appointments').select('*').limit(1).then(res => {
    if (res.error) {
        console.error("❌ Live DB Connection Failed with extreme inputs:", res.error);
        process.exit(1);
    } else {
        console.log(`✅ Live DB Connection Succeeded with extreme inputs! Query returned ${res.data ? res.data.length : 0} rows.`);
        if (failedCount > 0) process.exit(1);
    }
}).catch(err => {
    console.error("❌ Live DB Connection Threw Exception:", err.message);
    process.exit(1);
});
