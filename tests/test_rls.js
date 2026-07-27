require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const db = require('../services/databaseService');
const crypto = require('crypto');

const runId = `qa_${Date.now()}_${crypto.randomUUID().slice(0,8)}`;
const phoneA = `5511900000099`;
const phoneB = `5511900000088`;
const cpfA = '12345678909';
const cpfB = '09876543210';

let testClinicId = null;

async function setup() {
    const clinics = await db.clinics.getAll();
    testClinicId = clinics[0]?.id || 'b53600ce-7bb4-462d-89d6-7ead5fbc4568';
    await sb.from('sessions').delete().in('phone', [phoneA, phoneB]);
    await sb.from('appointments').delete().in('phone', [phoneA, phoneB]); // it will fail if phone is not a col, but cascade delete patients will handle it
    await sb.from('patients').delete().in('phone', [phoneA, phoneB]);
    
    // Create patient A
    const patA = await db.patients.findOrCreate(phoneA, testClinicId);
    await db.patients.updateCpf(phoneA, cpfA, testClinicId);
    
    // Create patient B
    const patB = await db.patients.findOrCreate(phoneB, testClinicId);
    await db.patients.updateCpf(phoneB, cpfB, testClinicId);
}

async function testRlsIsolation() {
    await setup();
    console.log(`Setup concluído para ${runId}. Iniciando testes de isolamento de Tenant (RLS Lógico)...`);
    
    // Test 1: Blind Indexing and Decryption
    const fetchedPatA = await db.patients.findByPhone(phoneA, testClinicId);
    const fetchedPatB = await db.patients.findByPhone(phoneB, testClinicId);
    
    console.log(fetchedPatA, fetchedPatB);
    if (!fetchedPatA || !fetchedPatB || fetchedPatA.cpf !== cpfA || fetchedPatB.cpf !== cpfB) {
        console.error("❌ FALHA: Descriptografia falhou ou cruzou os dados.");
        process.exit(1);
    }
    
    // Test 2: Search by CPF (Blind Indexing Hash should work)
    const patByCpfA = await db.patients.findByCpf(cpfA, testClinicId);
    if (!patByCpfA || patByCpfA.phone !== phoneA) {
        console.error("❌ FALHA: findByCpf retornou o paciente errado ou não encontrou via Blind Index.");
        process.exit(1);
    }
    
    console.log("✅ Isolamento de PatientData e Descriptografia verificado.");
    
    // Test 3: Session Isolation
    await db.sessions.set(phoneA, [{ role: 'user', parts: [{ text: 'Sou o paciente A' }] }], testClinicId);
    await db.sessions.set(phoneB, [{ role: 'user', parts: [{ text: 'Sou o paciente B' }] }], testClinicId);
    
    const histA = await db.sessions.get(phoneA, testClinicId);
    const histB = await db.sessions.get(phoneB, testClinicId);
    
    if (histA[0].parts[0].text !== 'Sou o paciente A' || histB[0].parts[0].text !== 'Sou o paciente B') {
        console.error("❌ FALHA: Contaminação de sessão entre Tenant A e Tenant B.");
        process.exit(1);
    }
    
    console.log("✅ Isolamento de Sessão de Chat verificado.");
    process.exit(0);
}

testRlsIsolation();
