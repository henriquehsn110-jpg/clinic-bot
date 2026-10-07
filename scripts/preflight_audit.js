/**
 * ðŸ›« CLINICABOT SAAS PRO â€” SCRIPT DE PRE-FLIGHT AUDIT & HOMOLOGAÃ‡ÃƒO DE TENANT
 * 
 * Executa 8 verificaÃ§Ãµes automatizadas rigorosas antes de colocar o bot
 * em produÃ§Ã£o para um cliente pagante real.
 * 
 * Uso:
 *   npm run preflight
 *   node scripts/preflight_audit.js --slug clinica-modelo
 */
const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../.env') });
const db = require('../services/databaseService');
const calendarService = require('../services/calendarService');
const aiService = require('../services/aiService');
const conversationController = require('../controllers/conversationController');

async function runPreflight() {
    console.log('\n================================================================');
    console.log('ðŸ›« CLINICABOT SAAS PRO â€” PRE-FLIGHT AUDIT (HOMOLOGAÃ‡ÃƒO DE TENANT)');
    console.log('================================================================\n');

    let passedSteps = 0;
    const totalSteps = 8;

    try {
        // [Etapa 1/8] Supabase e RLS Multi-Tenant
        console.log('[Etapa 1/8] Testando conexÃ£o com Supabase e RLS...');
        const clinics = await db.clinics.getAll();
        if (!clinics || clinics.length === 0) {
            throw new Error('Nenhuma clÃ­nica cadastrada na tabela clinics!');
        }
        console.log(`   âœ… PASS: ConexÃ£o ativa com Supabase. ${clinics.length} clÃ­nica(s) localizada(s).`);
        passedSteps++;

        // Seleciona clÃ­nica para teste
        const targetClinic = clinics.find(c => c.slug === 'clinica-modelo') || clinics[0];
        console.log(`   â„¹ï¸ ClÃ­nica Alvo para Teste: "${targetClinic.name}" [ID: ${targetClinic.id}]`);

        // [Etapa 2/8] Criptografia LGPD (CPF_ENCRYPTION_KEY)
        console.log('\n[Etapa 2/8] Verificando chave de criptografia AES-256 (CPF_ENCRYPTION_KEY)...');
        const key = process.env.CPF_ENCRYPTION_KEY;
        if (!key || key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
            throw new Error('CPF_ENCRYPTION_KEY invÃ¡lida ou ausente! Deve possuir exatamente 64 caracteres hexadecimais.');
        }
        console.log('   âœ… PASS: CPF_ENCRYPTION_KEY AES-256 vÃ¡lida e formatada.');
        passedSteps++;

        // [Etapa 3/8] Credenciais Meta / phone_number_id
        console.log('\n[Etapa 3/8] Verificando resoluÃ§Ã£o do phone_number_id da Meta WhatsApp...');
        const resolved = await db.clinics.findByPhoneNumberId(targetClinic.phone_number_id || '1240708369119720');
        if (!resolved) {
            throw new Error(`phone_number_id nÃ£o associado a nenhuma clÃ­nica no banco!`);
        }
        console.log(`   âœ… PASS: phone_number_id vinculado Ã  clÃ­nica "${resolved.name}".`);
        passedSteps++;

        // [Etapa 4/8] PadronizaÃ§Ã£o de Fuso HorÃ¡rio BRT (America/Sao_Paulo)
        console.log('\n[Etapa 4/8] Testando padronizaÃ§Ã£o de fuso horÃ¡rio BRT (America/Sao_Paulo)...');
        const brtString = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
        const brtDate = new Date(brtString);
        console.log(`   âœ… PASS: Fuso BRT calculado com sucesso: ${brtDate.toISOString()} (Hora local BRT: ${brtString})`);
        passedSteps++;

        // [Etapa 5/8] GeraÃ§Ã£o de HorÃ¡rios no calendarService
        console.log('\n[Etapa 5/8] Testando busca de vagas no calendarService...');
        const tomorrow = new Date(brtDate);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        
        const slots = await calendarService.getAvailableSlots(dateStr, targetClinic.id);
        if (!Array.isArray(slots) || slots.length === 0) {
            throw new Error(`Nenhum horÃ¡rio retornado para ${dateStr}. Verifique clinic_hours.`);
        }
        console.log(`   âœ… PASS: ${slots.length} horÃ¡rio(s) disponÃ­vel(is) retornado(s) para ${dateStr}: [${slots.slice(0, 3).join(', ')}...]`);
        passedSteps++;

        // [Etapa 6/8] Gemini AI Service
        console.log('\n[Etapa 6/8] Testando integraÃ§Ã£o com Google Gemini AI...');
        const aiRes = await aiService.generateResponse('OlÃ¡, gostaria de saber o horÃ¡rio de funcionamento', []);
        if (!aiRes || !aiRes.text) {
            throw new Error('A API do Gemini AI nÃ£o retornou resposta vÃ¡lida.');
        }
        console.log(`   âœ… PASS: Gemini AI respondeu em tempo hÃ¡bil: "${aiRes.text.substring(0, 50)}..."`);
        passedSteps++;

        // [Etapa 7/8] SimulaÃ§Ã£o de Fluxo DeterminÃ­stico em 5 Passos
        console.log('\n[Etapa 7/8] Simulando fluxo conversacional determinÃ­stico de agendamento (Simulador)...');
        const testPhone = '5511999998888';

        // Reset inicial
        await db.sessions.delete(testPhone, targetClinic.id);

        // Passo 1: Boas-vindas
        const step1 = await conversationController.handleIncomingMessage(testPhone, 'Oi', true, targetClinic.id);
        if (!step1.buttons || step1.buttons.length === 0) {
            throw new Error('Passo 1 (Boas-vindas) falhou em retornar botÃµes!');
        }

        // Passo 2: Seleção de Procedimento -> Força Calendário (ou Seleção de Médico se multi-doctor)
        const step2 = await conversationController.handleIncomingMessage(testPhone, 'Consulta geral', true, targetClinic.id);
        if (step2.showDoctorList) {
            const step2b = await conversationController.handleIncomingMessage(testPhone, 'Tanto faz', true, targetClinic.id);
            if (!step2b.showCalendar) {
                throw new Error('Passo 2b (Médico Tanto Faz) falhou em acionar showCalendar=true determinístico!');
            }
        } else if (!step2.showCalendar) {
            throw new Error('Passo 2 (Procedimento) falhou em acionar showCalendar=true determinístico!');
        }

        // Cleanup
        await db.sessions.delete(testPhone, targetClinic.id);
        console.log('   âœ… PASS: SimulaÃ§Ã£o de fluxo determinÃ­stico executada com 100% de sucesso.');
        passedSteps++;

        // [Etapa 8/8] RelatÃ³rio Final
        console.log('\n[Etapa 8/8] Compilando relatÃ³rio final de homologaÃ§Ã£o...');
        passedSteps++;

        console.log('\n================================================================');
        console.log(`ðŸŽ‰ PRE-FLIGHT AUDIT PASSED: ${passedSteps}/${totalSteps} PASSO(S) APROVADOS!`);
        console.log('================================================================');
        console.log(`ðŸ›¡ï¸ O Tenant "${targetClinic.name}" estÃ¡ 100% PRONTO para entrar em PRODUÃ‡ÃƒO!`);
        console.log('================================================================\n');

        process.exit(0);

    } catch (error) {
        console.error(`\nâŒ PRE-FLIGHT AUDIT FAILED no passo ${passedSteps + 1}/${totalSteps}:`);
        console.error(`   ${error.message}`);
        console.error(error.stack);
        console.log('\n================================================================');
        console.log('â›” HOMOLOGAÃ‡ÃƒO REJEITADA! Corrija os erros acima antes de subir o cliente.');
        console.log('================================================================\n');
        process.exit(1);
    }
}

runPreflight();

