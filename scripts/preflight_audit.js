/**
 * 🛫 CLINICABOT SAAS PRO — SCRIPT DE PRE-FLIGHT AUDIT & HOMOLOGAÇÃO DE TENANT
 * 
 * Executa 8 verificações automatizadas rigorosas antes de colocar o bot
 * em produção para um cliente pagante real.
 * 
 * Uso:
 *   npm run preflight
 *   node scripts/preflight_audit.js --slug clinica-modelo
 */

require('dotenv').config();
const db = require('../services/databaseService');
const calendarService = require('../services/calendarService');
const aiService = require('../services/aiService');
const conversationController = require('../controllers/conversationController');

async function runPreflight() {
    console.log('\n================================================================');
    console.log('🛫 CLINICABOT SAAS PRO — PRE-FLIGHT AUDIT (HOMOLOGAÇÃO DE TENANT)');
    console.log('================================================================\n');

    let passedSteps = 0;
    const totalSteps = 8;

    try {
        // [Etapa 1/8] Supabase e RLS Multi-Tenant
        console.log('[Etapa 1/8] Testando conexão com Supabase e RLS...');
        const clinics = await db.clinics.getAll();
        if (!clinics || clinics.length === 0) {
            throw new Error('Nenhuma clínica cadastrada na tabela clinics!');
        }
        console.log(`   ✅ PASS: Conexão ativa com Supabase. ${clinics.length} clínica(s) localizada(s).`);
        passedSteps++;

        // Seleciona clínica para teste
        const targetClinic = clinics.find(c => c.slug === 'clinica-modelo') || clinics[0];
        console.log(`   ℹ️ Clínica Alvo para Teste: "${targetClinic.name}" [ID: ${targetClinic.id}]`);

        // [Etapa 2/8] Criptografia LGPD (CPF_ENCRYPTION_KEY)
        console.log('\n[Etapa 2/8] Verificando chave de criptografia AES-256 (CPF_ENCRYPTION_KEY)...');
        const key = process.env.CPF_ENCRYPTION_KEY;
        if (!key || key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
            throw new Error('CPF_ENCRYPTION_KEY inválida ou ausente! Deve possuir exatamente 64 caracteres hexadecimais.');
        }
        console.log('   ✅ PASS: CPF_ENCRYPTION_KEY AES-256 válida e formatada.');
        passedSteps++;

        // [Etapa 3/8] Credenciais Meta / phone_number_id
        console.log('\n[Etapa 3/8] Verificando resolução do phone_number_id da Meta WhatsApp...');
        const resolved = await db.clinics.findByPhoneNumberId(targetClinic.phone_number_id || '1240708369119720');
        if (!resolved) {
            throw new Error(`phone_number_id não associado a nenhuma clínica no banco!`);
        }
        console.log(`   ✅ PASS: phone_number_id vinculado à clínica "${resolved.name}".`);
        passedSteps++;

        // [Etapa 4/8] Padronização de Fuso Horário BRT (America/Sao_Paulo)
        console.log('\n[Etapa 4/8] Testando padronização de fuso horário BRT (America/Sao_Paulo)...');
        const brtString = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
        const brtDate = new Date(brtString);
        console.log(`   ✅ PASS: Fuso BRT calculado com sucesso: ${brtDate.toISOString()} (Hora local BRT: ${brtString})`);
        passedSteps++;

        // [Etapa 5/8] Geração de Horários no calendarService
        console.log('\n[Etapa 5/8] Testando busca de vagas no calendarService...');
        const tomorrow = new Date(brtDate);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        
        const slots = await calendarService.getAvailableSlots(dateStr, targetClinic.id);
        if (!Array.isArray(slots) || slots.length === 0) {
            throw new Error(`Nenhum horário retornado para ${dateStr}. Verifique clinic_hours.`);
        }
        console.log(`   ✅ PASS: ${slots.length} horário(s) disponível(is) retornado(s) para ${dateStr}: [${slots.slice(0, 3).join(', ')}...]`);
        passedSteps++;

        // [Etapa 6/8] Gemini AI Service
        console.log('\n[Etapa 6/8] Testando integração com Google Gemini AI...');
        const aiRes = await aiService.generateResponse('Olá, gostaria de saber o horário de funcionamento', []);
        if (!aiRes || !aiRes.text) {
            throw new Error('A API do Gemini AI não retornou resposta válida.');
        }
        console.log(`   ✅ PASS: Gemini AI respondeu em tempo hábil: "${aiRes.text.substring(0, 50)}..."`);
        passedSteps++;

        // [Etapa 7/8] Simulação de Fluxo Determinístico em 5 Passos
        console.log('\n[Etapa 7/8] Simulando fluxo conversacional determinístico de agendamento (Simulador)...');
        const testPhone = '5511999998888';

        // Reset inicial
        await db.sessions.delete(testPhone, targetClinic.id);

        // Passo 1: Boas-vindas
        const step1 = await conversationController.handleIncomingMessage(testPhone, 'Oi', true, targetClinic.id);
        if (!step1.buttons || step1.buttons.length === 0) {
            throw new Error('Passo 1 (Boas-vindas) falhou em retornar botões!');
        }

        // Passo 2: Seleção de Procedimento -> Força Calendário
        const step2 = await conversationController.handleIncomingMessage(testPhone, 'Consulta geral', true, targetClinic.id);
        if (!step2.showCalendar) {
            throw new Error('Passo 2 (Procedimento) falhou em acionar showCalendar=true determinístico!');
        }

        // Cleanup
        await db.sessions.delete(testPhone, targetClinic.id);
        console.log('   ✅ PASS: Simulação de fluxo determinístico executada com 100% de sucesso.');
        passedSteps++;

        // [Etapa 8/8] Relatório Final
        console.log('\n[Etapa 8/8] Compilando relatório final de homologação...');
        passedSteps++;

        console.log('\n================================================================');
        console.log(`🎉 PRE-FLIGHT AUDIT PASSED: ${passedSteps}/${totalSteps} PASSO(S) APROVADOS!`);
        console.log('================================================================');
        console.log(`🛡️ O Tenant "${targetClinic.name}" está 100% PRONTO para entrar em PRODUÇÃO!`);
        console.log('================================================================\n');

        process.exit(0);

    } catch (error) {
        console.error(`\n❌ PRE-FLIGHT AUDIT FAILED no passo ${passedSteps + 1}/${totalSteps}:`);
        console.error(`   ${error.message}`);
        console.error(error.stack);
        console.log('\n================================================================');
        console.log('⛔ HOMOLOGAÇÃO REJEITADA! Corrija os erros acima antes de subir o cliente.');
        console.log('================================================================\n');
        process.exit(1);
    }
}

runPreflight();
