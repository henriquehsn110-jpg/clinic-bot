require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const db = require('../../services/databaseService');

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const runId = `qa_${Date.now()}_${crypto.randomUUID().slice(0,8)}`;
const phone1 = `5511900000010`;
const phone2 = `5511900000011`;

async function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

let testClinicId = null;

async function setup() {
    const clinics = await db.clinics.getAll();
    testClinicId = clinics[0]?.id || 'b53600ce-7bb4-462d-89d6-7ead5fbc4568';

    // Apaga se já existir
    await sb.from('sessions').delete().in('phone', [phone1, phone2]);
    await sb.from('patients').delete().in('phone', [phone1, phone2]);
    
    // Cadastra pacientes falsos com clinic_id para que não peça CPF
    const p1 = await sb.from('patients').insert({ phone: phone1, name: 'Paciente A', clinic_id: testClinicId }).select().single();
    const p2 = await sb.from('patients').insert({ phone: phone2, name: 'Paciente B', clinic_id: testClinicId }).select().single();
    
    // Injeta drafts forjados
    await db.sessions.set(phone1, [
        { role: 'user', parts: [{ text: 'Quero agendar' }] },
        { role: 'model', parts: [{ text: 'Você deseja confirmar o agendamento para 2026-12-20 às 09:00?' }] }
    ], testClinicId);
    await db.sessions.setDraft(phone1, { 
        type: 'Avaliação', date: '2026-12-20', time: '09:00' 
    }, testClinicId);
    
    await db.sessions.set(phone2, [
        { role: 'user', parts: [{ text: 'Quero agendar' }] },
        { role: 'model', parts: [{ text: 'Você deseja confirmar o agendamento para 2026-12-20 às 09:00?' }] }
    ], testClinicId);
    await db.sessions.setDraft(phone2, { 
        type: 'Avaliação', date: '2026-12-20', time: '09:00' 
    }, testClinicId);
    
    console.log(`Setup concluído para ${runId}. Iniciando simulação concorrente...`);
}

const controller = require('../../controllers/conversationController');

async function simulateConfirm(phone) {
    try {
        const response = await controller.handleIncomingMessage(phone, 'Confirmar', false, testClinicId);
        return { text: response.text };
    } catch (e) {
        return { error: e.message };
    }
}

async function run() {
    await setup();
    
    // Simula concorrência real atirando os dois simultaneamente
    const results = await Promise.all([
        simulateConfirm(phone1),
        simulateConfirm(phone2)
    ]);
    
    console.log("=== Resultados da Corrida ===");
    console.log("Phone1:", JSON.stringify(results[0].text).slice(0, 100));
    console.log("Phone2:", JSON.stringify(results[1].text).slice(0, 100));
    
    // Verifica no banco
    const apps = await sb.from('appointments').select('*, patients(phone)').eq('appointment_date', '2026-12-20').eq('appointment_time', '09:00');
    console.log(`\nAgendamentos salvos para 09:00: ${apps.data.length}`);
    if (apps.data.length > 1) {
        console.error("❌ FALHA: Overbooking detectado!");
        process.exit(1);
    } else {
        console.log("✅ SUCESSO: Apenas um agendamento foi salvo.");
    }
    
    process.exit(0);
}

run();
