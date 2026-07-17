require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const db = require('./services/databaseService');
const crypto = require('crypto');

const runId = `qa_${Date.now()}_${crypto.randomUUID().slice(0,8)}`;
const phoneA = `5511900000099`;
const phoneB = `5511900000088`;
const cpfA = '12345678909';
const cpfB = '09876543210';

async function setup() {
    await sb.from('sessions').delete().in('phone', [phoneA, phoneB]);
    await sb.from('appointments').delete().in('phone', [phoneA, phoneB]); // it will fail if phone is not a col, but cascade delete patients will handle it
    await sb.from('patients').delete().in('phone', [phoneA, phoneB]);
    
    // Create patient A
    const patA = await db.patients.findOrCreate(phoneA);
    await db.patients.updateCpf(phoneA, cpfA);
    
    // Create patient B
    const patB = await db.patients.findOrCreate(phoneB);
    await db.patients.updateCpf(phoneB, cpfB);
}

async function testRlsIsolation() {
    await setup();
    console.log(`Setup concluído para ${runId}. Iniciando testes de isolamento de Tenant (RLS Lógico)...`);
    
    // Test 1: Blind Indexing and Decryption
    const fetchedPatA = await db.patients.findByPhone(phoneA);
    const fetchedPatB = await db.patients.findByPhone(phoneB);
    
    console.log(fetchedPatA, fetchedPatB);
    if (!fetchedPatA || !fetchedPatB || fetchedPatA.cpf !== cpfA || fetchedPatB.cpf !== cpfB) {
        console.error("❌ FALHA: Descriptografia falhou ou cruzou os dados.");
        process.exit(1);
    }
    
    // Test 2: Search by CPF (Blind Indexing Hash should work)
    const patByCpfA = await db.patients.findByCpf(cpfA);
    if (!patByCpfA || patByCpfA.phone !== phoneA) {
        console.error("❌ FALHA: findByCpf retornou o paciente errado ou não encontrou via Blind Index.");
        process.exit(1);
    }
    
    console.log("✅ Isolamento de PatientData e Descriptografia verificado.");
    
    // Test 3: Session Isolation
    await db.sessions.set(phoneA, [{ role: 'user', parts: [{ text: 'Sou o paciente A' }] }]);
    await db.sessions.set(phoneB, [{ role: 'user', parts: [{ text: 'Sou o paciente B' }] }]);
    
    const histA = await db.sessions.get(phoneA);
    const histB = await db.sessions.get(phoneB);
    
    if (histA[0].parts[0].text !== 'Sou o paciente A' || histB[0].parts[0].text !== 'Sou o paciente B') {
        console.error("❌ FALHA: Contaminação de sessão entre Tenant A e Tenant B.");
        process.exit(1);
    }
    
    console.log("✅ Isolamento de Sessão de Chat verificado.");
    process.exit(0);
}

testRlsIsolation();
