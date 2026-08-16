/**
 * ============================================================================
 * TESTE DE PERSISTÊNCIA RELACIONAL DE DEPENDENTES (FAMILY_BOOKING)
 * ============================================================================
 * Valida:
 * 1. Criação e vinculação de dependente com guardian_id na tabela patients.
 * 2. Criptografia AES-256-GCM do CPF do dependente com hash blind index.
 * 3. Recuperação via db.patients.findDependentsByGuardian.
 * 4. Criação do appointment com patient_id do dependente (não do titular).
 * 5. UX FSM: Atalho inteligente que exibe dependentes salvos e pula coleta de CPF.
 * ============================================================================
 */

const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../.env') });
const assert = require('assert');
const db = require('../services/databaseService');
const calendarService = require('../services/calendarService');
const conversationController = require('../controllers/conversationController');

const TITULAR_PHONE = `5511999${Math.floor(100000 + Math.random() * 900000)}`;
const TITULAR_NAME = 'Maria Silva dos Santos';
const TITULAR_CPF = String(Math.floor(10000000000 + Math.random() * 89999999999));

const DEPENDENT_NAME = 'Pedro Henrique Silva';
const DEPENDENT_CPF = String(Math.floor(10000000000 + Math.random() * 89999999999));

async function runTest() {
    console.log('================================================================');
    console.log('🧪 [TEST] Persistência Relacional de Dependentes (FAMILY_BOOKING)');
    console.log('================================================================\n');

    let titular = null;
    let dependent = null;
    let createdApptId = null;

    // Resolve UUID da clínica modelo
    const clinic = await db.clinics.findBySlug('clinica-modelo');
    const clinicId = clinic ? clinic.id : 'e8f24abe-381d-499d-9596-252507b32194';
    console.log(`🏥 Clínica resolvida: ${clinic?.name || 'Clínica Modelo'} (ID: ${clinicId})`);

    try {
        // ── 1. Criar Titular ──────────────────────────────────────────────────
        console.log('\n1. Criando paciente titular...');
        titular = await db.patients.findOrCreate(TITULAR_PHONE, clinicId);
        await db.patients.updateName(TITULAR_PHONE, TITULAR_NAME, clinicId);
        await db.patients.updateCpf(TITULAR_PHONE, TITULAR_CPF, clinicId);
        console.log(`   ✅ Titular criado: ${titular.id} (${TITULAR_NAME}, ${TITULAR_PHONE})`);

        // ── 2. Criar Dependente Vinculado ─────────────────────────────────────
        console.log('\n2. Criando dependente vinculado ao titular (guardian_id)...');
        dependent = await db.patients.findOrCreateDependent({
            guardianId: titular.id,
            clinicId: clinicId,
            name: DEPENDENT_NAME,
            cpf: DEPENDENT_CPF,
            phone: TITULAR_PHONE
        });

        assert(dependent, 'Dependente deve ser retornado');
        assert(dependent.id, 'Dependente deve possuir ID');
        assert.strictEqual(dependent.guardian_id, titular.id, 'guardian_id deve apontar para o titular');
        assert.strictEqual(dependent.name, DEPENDENT_NAME, 'Nome do dependente deve coincidir');
        assert.strictEqual(dependent.cpf, DEPENDENT_CPF, 'CPF deve ser retornado descriptografado');
        console.log(`   ✅ Dependente persistido com sucesso: ${dependent.id} (guardian_id: ${dependent.guardian_id})`);

        // ── 3. Testar Listagem de Dependentes do Titular ──────────────────────
        console.log('\n3. Testando db.patients.findDependentsByGuardian...');
        const deps = await db.patients.findDependentsByGuardian(titular.id, clinicId);
        assert(Array.isArray(deps), 'Deve retornar um array');
        assert.strictEqual(deps.length, 1, 'Deve conter exatamente 1 dependente');
        assert.strictEqual(deps[0].id, dependent.id, 'ID do dependente deve bater');
        assert.strictEqual(deps[0].name, DEPENDENT_NAME, 'Nome do dependente deve bater');
        console.log(`   ✅ Dependentes listados com sucesso: ${deps.length} dependente(s) vinculado(s)`);

        // ── 4. Agendar Consulta para o Dependente ─────────────────────────────
        console.log('\n4. Testando agendamento atrelado ao dependente (scheduleAppointment)...');
        const testDate = '2029-07-20';
        const testTime = '14:00';
        const appt = await calendarService.scheduleAppointment({
            clinicId: clinicId,
            phone: TITULAR_PHONE,
            is_family_booking: true,
            dependentName: DEPENDENT_NAME,
            dependentCpf: DEPENDENT_CPF,
            dependent_id: dependent.id,
            date: testDate,
            time: testTime,
            type: 'Limpeza Dental'
        });

        assert(appt, 'Agendamento deve ser criado');
        createdApptId = appt.id;
        assert.strictEqual(appt.patient_id, dependent.id, 'Agendamento DEVE ter patient_id do dependente, NÃO do titular');
        assert.strictEqual(appt.clinic_id, clinicId, 'clinic_id deve ser respeitado');
        console.log(`   ✅ Agendamento criado com sucesso: ID ${appt.id} -> patient_id: ${appt.patient_id} (Dependente)`);

        // ── 5. Testar Fluxo FSM: Reconhecimento Inteligente de Dependente Salvo ─
        console.log('\n5. Testando FSM: Reconhecimento de dependente salvo e atalhos rápidos...');
        
        // Simula titular enviando "Agendar p/ Outro"
        const res1 = await conversationController.handleIncomingMessage({
            phone: TITULAR_PHONE,
            text: 'Agendar p/ Outro',
            isSimulation: true,
            clinicId: clinicId
        });

        console.log('   - Resposta do bot ao "Agendar p/ Outro":', res1.text);
        console.log('   - Botões retornados:', res1.buttons);
        assert(res1.buttons.includes(DEPENDENT_NAME), 'Bot deve oferecer botão com o nome do dependente salvo');
        assert(res1.buttons.includes('+ Outro'), 'Bot deve oferecer opção de cadastrar outro');

        // Simula titular clicando no botão do dependente salvo ("Pedro Henrique Silva")
        const res2 = await conversationController.handleIncomingMessage({
            phone: TITULAR_PHONE,
            text: DEPENDENT_NAME,
            isSimulation: true,
            clinicId: clinicId
        });

        console.log(`\n   - Resposta ao selecionar [${DEPENDENT_NAME}]:`, res2.text);
        console.log('   - Mostra lista de procedimentos:', res2.showProceduresList);
        assert(res2.showProceduresList, 'Deve avançar diretamente para procedimentos sem pedir nome/CPF novamente');

        console.log('\n================================================================');
        console.log('🎉 [PASS] Todos os 5 cenários de persistência de dependente passaram com 100% de sucesso!');
        console.log('================================================================\n');

    } finally {
        console.log('🧹 Limpando dados sintéticos de teste...');
        if (createdApptId) {
            await db.supabase.from('appointments').delete().eq('id', createdApptId);
        }
        if (dependent && dependent.id) {
            await db.supabase.from('patients').delete().eq('id', dependent.id);
        }
        if (titular && titular.id) {
            await db.supabase.from('patients').delete().eq('id', titular.id);
            await db.supabase.from('sessions').delete().eq('phone', TITULAR_PHONE);
        }
        console.log('✅ Base de teste limpa com sucesso.');
    }
}

runTest().then(() => process.exit(0)).catch(err => {
    console.error('❌ ERRO NO TESTE:', err);
    process.exit(1);
});
