/**
 * Empirical Challenger Verification Harness for M2 Webhook Ingestion & Supabase DB Sanitization
 * Location: .agents/teamwork_preview_challenger_m2_1/verify_m2_webhook.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../clinic-bot-backend/.env') });
const crypto = require('crypto');
const axios = require('axios');
const path = require('path');
const { cleanEnvVar, supabase, webhooks } = require(path.join(__dirname, '../../clinic-bot-backend/services/databaseService'));

const BASE_URL = 'http://localhost:3000';

async function runEmpiricalVerification() {
    console.log("==================================================================");
    console.log("🧪 EMPIRICAL CHALLENGER VERIFICATION HARNESS — MILESTONE 2");
    console.log("==================================================================");

    let passCount = 0;
    let failCount = 0;

    function assert(condition, testName, detail = '') {
        if (condition) {
            passCount++;
            console.log(`✅ [PASS] ${testName} ${detail ? '(' + detail + ')' : ''}`);
        } else {
            failCount++;
            console.error(`❌ [FAIL] ${testName} ${detail ? '(' + detail + ')' : ''}`);
        }
    }

    // 1. Unit Test: cleanEnvVar Sanitization Logic
    console.log("\n--- 1. Testing cleanEnvVar Credential Sanitization ---");
    const testCases = [
        { input: '"https://xyz.supabase.co"', expected: 'https://xyz.supabase.co' },
        { input: "'eyJhbGciOi...'", expected: 'eyJhbGciOi...' },
        { input: "`https://abc.supabase.co`\n", expected: 'https://abc.supabase.co' },
        { input: '   "\'key_with_mixed_quotes\'"   ', expected: 'key_with_mixed_quotes' },
        { input: undefined, expected: '' },
        { input: null, expected: '' }
    ];

    testCases.forEach((tc, idx) => {
        const cleaned = cleanEnvVar(tc.input);
        assert(cleaned === tc.expected, `cleanEnvVar Case #${idx + 1}`, `Input: ${JSON.stringify(tc.input)} -> Cleaned: ${JSON.stringify(cleaned)}`);
    });

    // 2. Integration Test: Database Connection Check
    console.log("\n--- 2. Testing Live Supabase Database Connection ---");
    try {
        const { data, error } = await supabase.from('appointments').select('*').limit(5);
        if (error) {
            assert(false, "Supabase Database Connection Query", `Error: ${error.message} (Code: ${error.code})`);
        } else {
            assert(true, "Supabase Database Connection Query", `Successfully retrieved ${data.length} appointment records without 'Unregistered API key' error.`);
        }
    } catch (dbErr) {
        assert(false, "Supabase Database Connection Query", `Exception: ${dbErr.message}`);
    }

    // 3. Webhook HMAC & Ingestion Integration Tests (Server must be listening)
    console.log("\n--- 3. Testing Webhook POST Endpoints against running server ---");
    let serverOnline = false;
    try {
        await axios.get(`${BASE_URL}/health`, { timeout: 1500 });
        serverOnline = true;
        console.log("ℹ️ Backend HTTP server is online at http://localhost:3000.");
    } catch (e) {
        console.warn("⚠️ Backend HTTP server at http://localhost:3000 is not currently listening.");
        console.warn("   (Note: To run HTTP endpoint assertions live, start `node server.js` in clinic-bot-backend).");
    }

    if (serverOnline) {
        const payload = {
            object: "whatsapp_business_account",
            entry: [{
                id: "test_entry_m2",
                changes: [{
                    value: {
                        messaging_product: "whatsapp",
                        metadata: { display_phone_number: "15551791342", phone_number_id: "1213330188528216" },
                        contacts: [{ wa_id: "5511999999999", profile: { name: "Challenger Test" } }],
                        messages: [{
                            from: "5511999999999",
                            id: "wamid.challenger_" + Date.now(),
                            timestamp: Math.floor(Date.now() / 1000).toString(),
                            text: { body: "Teste empírico challenger M2" },
                            type: "text"
                        }]
                    },
                    field: "messages"
                }]
            }]
        };

        const rawBodyStr = JSON.stringify(payload);

        // 3a. Invalid HMAC Signature Test
        try {
            await axios.post(`${BASE_URL}/api/webhook`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000'
                }
            });
            assert(false, "Invalid HMAC Signature Request", "Accepted invalid signature (Expected HTTP 403)");
        } catch (err) {
            const status = err.response ? err.response.status : null;
            assert(status === 403, "Invalid HMAC Signature Request", `Received expected HTTP ${status} Forbidden`);
        }

        // 3b. Valid HMAC Signature Request
        const appSecret = process.env.APP_SECRET || '';
        const validSignature = 'sha256=' + crypto.createHmac('sha256', appSecret).update(Buffer.from(rawBodyStr)).digest('hex');

        try {
            const res = await axios.post(`${BASE_URL}/api/webhook`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-hub-signature-256': validSignature
                }
            });
            assert(res.status === 200, "Valid HMAC Webhook Request", `Received HTTP ${res.status} OK without 'Unregistered API key' error`);
        } catch (err) {
            assert(false, "Valid HMAC Webhook Request", `Failed with status ${err.response ? err.response.status : err.message}`);
        }
    }

    console.log("\n==================================================================");
    console.log(`📊 SUMMARY: ${passCount} Passed, ${failCount} Failed.`);
    console.log("==================================================================");
}

if (require.main === module) {
    runEmpiricalVerification();
}

module.exports = { runEmpiricalVerification };
