/**
 * MEDIÇÃO DE DECOMPOSIÇÃO DE LATÊNCIA DE REDE (DNS, TCP, TLS, TTFB, TOTAL)
 */
process.env.DOTENV_CONFIG_PATH = process.env.DOTENV_CONFIG_PATH || require('path').resolve(__dirname, '../.env.staging');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });

const https = require('https');
const { URL } = require('url');

function measureUrlTiming(targetUrl, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(targetUrl);
        const timings = {
            dnsLookup: 0,
            tcpConnect: 0,
            tlsHandshake: 0,
            firstByte: 0,
            download: 0,
            total: 0,
            statusCode: 0
        };

        const start = process.hrtime.bigint();
        let dnsTime, tcpTime, tlsTime, firstByteTime;

        const req = https.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                ...headers,
                'User-Agent': 'ClinicBot-Diagnostic/1.0'
            }
        }, (res) => {
            firstByteTime = process.hrtime.bigint();
            timings.firstByte = Number(firstByteTime - (tlsTime || tcpTime || start)) / 1e6;
            timings.statusCode = res.statusCode;

            let bodyLength = 0;
            res.on('data', (chunk) => {
                bodyLength += chunk.length;
            });

            res.on('end', () => {
                const end = process.hrtime.bigint();
                timings.download = Number(end - firstByteTime) / 1e6;
                timings.total = Number(end - start) / 1e6;
                timings.bodyBytes = bodyLength;
                resolve(timings);
            });
        });

        req.on('socket', (socket) => {
            socket.on('lookup', () => {
                dnsTime = process.hrtime.bigint();
                timings.dnsLookup = Number(dnsTime - start) / 1e6;
            });
            socket.on('connect', () => {
                tcpTime = process.hrtime.bigint();
                timings.tcpConnect = Number(tcpTime - (dnsTime || start)) / 1e6;
            });
            socket.on('secureConnect', () => {
                tlsTime = process.hrtime.bigint();
                timings.tlsHandshake = Number(tlsTime - (tcpTime || start)) / 1e6;
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function runDecompositionAnalysis() {
    console.log('================================================================');
    console.log('📡 [PROMPT 7 - R3] DECOMPOSIÇÃO DE LATÊNCIA DE REDE');
    console.log('================================================================');

    const supabaseUrl = `${process.env.SUPABASE_URL}/rest/v1/clinics?select=id,name,slug&slug=eq.clinica-modelo`;
    const supabaseHeaders = {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    const renderUrl = 'https://clinic-bot-zksc.onrender.com/health';

    console.log('\n1. Medindo conexão direta ao Supabase (PostgREST AWS sa-east-1 / us-east-1):');
    const sbTiming = await measureUrlTiming(supabaseUrl, supabaseHeaders);
    console.log(`   • DNS Lookup:     ${sbTiming.dnsLookup.toFixed(2)} ms`);
    console.log(`   • TCP Connect:    ${sbTiming.tcpConnect.toFixed(2)} ms`);
    console.log(`   • TLS Handshake:  ${sbTiming.tlsHandshake.toFixed(2)} ms`);
    console.log(`   • TTFB (Server):  ${sbTiming.firstByte.toFixed(2)} ms`);
    console.log(`   • Download Body:  ${sbTiming.download.toFixed(2)} ms (${sbTiming.bodyBytes} bytes)`);
    console.log(`   ⏱️ TOTAL:          ${sbTiming.total.toFixed(2)} ms [HTTP ${sbTiming.statusCode}]`);

    console.log('\n2. Medindo conexão ao Render Staging (/health):');
    const renderTiming = await measureUrlTiming(renderUrl);
    console.log(`   • DNS Lookup:     ${renderTiming.dnsLookup.toFixed(2)} ms`);
    console.log(`   • TCP Connect:    ${renderTiming.tcpConnect.toFixed(2)} ms`);
    console.log(`   • TLS Handshake:  ${renderTiming.tlsHandshake.toFixed(2)} ms`);
    console.log(`   • TTFB (Server):  ${renderTiming.firstByte.toFixed(2)} ms`);
    console.log(`   • Download Body:  ${renderTiming.download.toFixed(2)} ms (${renderTiming.bodyBytes} bytes)`);
    console.log(`   ⏱️ TOTAL:          ${renderTiming.total.toFixed(2)} ms [HTTP ${renderTiming.statusCode}]`);

    console.log('\n3. Medindo 5 requisições sequenciais de aquecimento ao Supabase (Connection Keep-Alive):');
    for (let i = 1; i <= 5; i++) {
        const t = await measureUrlTiming(supabaseUrl, supabaseHeaders);
        console.log(`   [Req #${i}] TTFB: ${t.firstByte.toFixed(2)}ms | Total: ${t.total.toFixed(2)}ms | Bytes: ${t.bodyBytes}`);
    }
}

runDecompositionAnalysis().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
