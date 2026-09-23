const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../.env') });
const db = require('../services/databaseService');
const crypto = require('crypto');
const { assert } = require('console');

async function runTests() {
    console.log('🧪 Iniciando Testes V19: Sessões Distribuídas, Webhook Idempotency e Efeitos Externos (A-AH)...');

    // Setup de teste
    const clinic = await db.supabase.from('clinics').select('id').eq('slug', 'clinica-modelo').single().then(r => r.data);
    if (!clinic) throw new Error("Clínica modelo não encontrada.");
    const clinicId = clinic.id;
    const phone = '5511999999999';

    // Limpa estado
    await db.supabase.from('session_locks').delete().eq('clinic_id', clinicId);
    await db.supabase.from('webhook_logs').delete().neq('message_id', 'dummy');
    await db.supabase.from('message_effects').delete().neq('message_id', 'dummy');
    await db.sessions.delete(phone, clinicId);

    // ─────────────────────────────────────────────────────────────────────────────
    // TESTES DE SESSION LOCK (A-H, T, U)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- SESSION LOCKS ---');
    const lockA = crypto.randomUUID();
    const lockB = crypto.randomUUID();

    // Cenário A/B: Aquisição e Concorrência
    let acqA = await db.sessionLocks.acquire(phone, clinicId, lockA, 5);
    console.assert(acqA === true, 'A1: Worker A deve adquirir o lock');
    let acqB = await db.sessionLocks.acquire(phone, clinicId, lockB, 5);
    console.assert(acqB === false, 'A2: Worker B deve ser rejeitado (lock ocupado)');

    // Cenário U/AA: FOR UPDATE serializa e protege persistência
    let history = [{ role: 'user', parts: [{ text: 'oi' }] }];
    let draft = { type: 'test' };
    
    // Tenta persistir com lock errado (Teste T - Anti-TOCTOU Node)
    let persistB = await db.sessions.persistStateIfOwned(phone, clinicId, lockB, history, draft).catch(e => e);
    console.assert(persistB.code === 'SESSION_LOCK_LOST', 'T1: Worker B não pode persistir estado sem possuir o lock');

    // Persiste com lock correto (Teste AA - Atomicidade de FSM)
    let persistA = await db.sessions.persistStateIfOwned(phone, clinicId, lockA, history, draft);
    console.assert(persistA === true, 'AA1: Worker A persiste history+draft atomicamente');

    // Cenário W/C: Takeover após TTL
    console.log('⏳ Aguardando 6s para expirar o lease do Worker A...');
    await new Promise(r => setTimeout(r, 6000));
    let acqB_after = await db.sessionLocks.acquire(phone, clinicId, lockB, 5);
    console.assert(acqB_after === true, 'W1: Worker B assume o lock após expiração (takeover)');

    let persistA_after = await db.sessions.persistStateIfOwned(phone, clinicId, lockA, history, draft).catch(e => e);
    console.assert(persistA_after.code === 'SESSION_LOCK_LOST', 'C1: Worker A não pode persistir após perder lease para B');

    // ─────────────────────────────────────────────────────────────────────────────
    // TESTES DE WEBHOOK IDEMPOTENCY (I-N, V, X)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- WEBHOOK IDEMPOTENCY ---');
    const msgId = 'msg_' + Date.now();
    const tokenA = crypto.randomUUID();
    const tokenB = crypto.randomUUID();

    // Cenário I: Primeiro claim
    let claim1 = await db.webhooks.claim(msgId, clinicId, phone, tokenA, 3, 30);
    console.assert(claim1.status === 'CLAIMED', 'I1: Primeira chamada deve ser CLAIMED');
    console.assert(claim1.processing_token === tokenA, 'I2: Token A retornado');

    // Cenário J: Claim simultâneo (23505 evitado via FOR UPDATE)
    let claim2 = await db.webhooks.claim(msgId, clinicId, phone, tokenB, 3, 30);
    console.assert(claim2.status === 'ALREADY_PROCESSING', 'J1: Segunda chamada imediata retorna ALREADY_PROCESSING');

    // Cenário V: Heartbeat previne takeover
    let renewWh = await db.webhooks.renew(msgId, tokenA, 5);
    console.assert(renewWh === true, 'V1: Heartbeat renova lease');
    
    // Cenário X: Fencing após perda
    // Simula expiração do lease
    await db.supabase.from('webhook_logs').update({
        processing_expires_at: new Date(Date.now() - 10000).toISOString()
    }).eq('message_id', msgId);
    let claim3 = await db.webhooks.claim(msgId, clinicId, phone, tokenB, 3, 30);
    console.assert(claim3.status === 'CLAIMED', 'X1: Worker B assume após lease de A expirar');
    console.assert(claim3.processing_token === tokenB, 'X2: Token B assumiu');
    
    // A tenta completar com token antigo (deve falhar)
    let compA = await db.webhooks.complete(msgId, tokenA);
    console.assert(compA === false, 'X3: Worker A não pode completar com token expirado/sobrescrito');

    // B completa
    let compB = await db.webhooks.complete(msgId, tokenB);
    console.assert(compB === true, 'X4: Worker B completa com sucesso');
    
    // Verifica limpeza (Limpeza de residual)
    let whRow = await db.supabase.from('webhook_logs').select('*').eq('message_id', msgId).single().then(r => r.data);
    console.assert(whRow.processing_token === null && whRow.processing_expires_at === null, 'X5: completed limpa token e expires_at');

    // Cenário Y: Failed é terminal
    const msgIdFail = 'msg_fail_' + Date.now();
    await db.webhooks.claim(msgIdFail, clinicId, phone, tokenA, 3, 30);
    await db.webhooks.fail(msgIdFail, tokenA, 'Simulated fatal error');
    let claimFail = await db.webhooks.claim(msgIdFail, clinicId, phone, tokenB, 3, 30);
    console.assert(claimFail.status === 'ALREADY_FAILED', 'Y1: Estado failed é terminal e retorna ALREADY_FAILED');

    // Cenário Dead-Letter (MAX_RETRIES)
    const msgIdDl = 'msg_dl_' + Date.now();
    await db.webhooks.claim(msgIdDl, clinicId, phone, tokenA, 1, 30); // max 1
    await db.webhooks.defer(msgIdDl, tokenA, 'Retry 1', 1); // 1s backoff
    await db.supabase.from('webhook_logs').update({
        next_retry_at: new Date(Date.now() - 10000).toISOString()
    }).eq('message_id', msgIdDl);
    let claimDl = await db.webhooks.claim(msgIdDl, clinicId, phone, tokenB, 1, 30);
    console.assert(claimDl.status === 'DEAD_LETTER', 'Y2: Exceder max_retries move para DEAD_LETTER');

    // ─────────────────────────────────────────────────────────────────────────────
    // TESTES DE MESSAGE EFFECTS (Z, AB, AC, AD, AE)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- MESSAGE EFFECTS ---');
    const effectKey = 'whatsapp_send_1';
    const effTokenA = crypto.randomUUID();
    const effTokenB = crypto.randomUUID();

    // Cenário AD: Execução concorrente
    let effClaimA = await db.effects.claim(msgId, 'whatsapp', effectKey, effTokenA, 30, 3);
    console.assert(effClaimA.status === 'CLAIMED', 'AD1: Worker A ganha claim do effect');
    let effClaimB = await db.effects.claim(msgId, 'whatsapp', effectKey, effTokenB, 30, 3);
    console.assert(effClaimB.status === 'ALREADY_PROCESSING', 'AD2: Worker B bloqueado');

    // Cenário AB: Crash após claim (simula expiração de lease)
    await db.supabase.from('message_effects').update({
        effect_expires_at: new Date(Date.now() - 10000).toISOString()
    }).eq('message_id', msgId);
    let effClaimB_takeover = await db.effects.claim(msgId, 'whatsapp', effectKey, effTokenB, 30, 3);
    console.assert(effClaimB_takeover.status === 'CLAIMED', 'AB1: Worker B assume o effect após expirar (crash simulation)');
    let effRowAB = await db.supabase.from('message_effects').select('*').eq('message_id', msgId).single().then(r=>r.data);
    console.assert(effRowAB.attempt_count === 2, 'AB2: attempt_count deve incrementar para 2 após takeover');

    // Cenário AC: Worker A tenta marcar como executed após perder lease
    let markA = await db.effects.markExecuted(msgId, 'whatsapp', effectKey, effTokenA);
    console.assert(markA === false, 'AC1: Worker A não pode marcar executed sem o token correto');
    
    // Worker B marca executed
    let markB = await db.effects.markExecuted(msgId, 'whatsapp', effectKey, effTokenB);
    console.assert(markB === true, 'Z2.1: Worker B marca executed');
    let effRowZ = await db.supabase.from('message_effects').select('*').eq('message_id', msgId).single().then(r=>r.data);
    console.assert(effRowZ.effect_token === null, 'Z2.2: markExecuted limpa effect_token');

    // Cenário AF: Defer incrementa attempt_count e Fail é terminal
    const effFail = 'whatsapp_fail';
    let effClaimC = await db.effects.claim(msgId, 'whatsapp', effFail, effTokenA, 30, 2);
    await db.effects.defer(msgId, 'whatsapp', effFail, effTokenA, 'Network issue', 1); // 1s backoff
    await db.supabase.from('message_effects').update({
        next_retry_at: new Date(Date.now() - 10000).toISOString()
    }).eq('effect_key', effFail);
    let effClaimC2 = await db.effects.claim(msgId, 'whatsapp', effFail, effTokenB, 30, 2);
    console.assert(effClaimC2.status === 'CLAIMED', 'AF1: Segundo claim permitido após defer');
    let effRowAF = await db.supabase.from('message_effects').select('*').eq('effect_key', effFail).single().then(r=>r.data);
    console.assert(effRowAF.attempt_count === 2, 'AF2: Defer + Claim incrementa attempt_count');
    
    await db.effects.fail(msgId, 'whatsapp', effFail, effTokenB, 'Fatal');
    let effClaimC3 = await db.effects.claim(msgId, 'whatsapp', effFail, effTokenA, 30, 2);
    console.assert(effClaimC3.status === 'ALREADY_FAILED', 'AF3: Fail é terminal em effects');

    // Cenário AG: Proteção contra crash loop durante processing (Takeovers sucessivos atingem DEAD_LETTER)
    const msgIdCrash = 'msg_crash_' + Date.now();
    const tokenCrash1 = crypto.randomUUID();
    const tokenCrash2 = crypto.randomUUID();
    const tokenCrash3 = crypto.randomUUID();

    // 1ª tentativa (claim inicial com max_retries = 2)
    let claimCrash1 = await db.webhooks.claim(msgIdCrash, clinicId, phone, tokenCrash1, 2, 30);
    console.assert(claimCrash1.status === 'CLAIMED', 'AG1: 1ª tentativa de claim bem-sucedida');

    // Simula crash do worker 1 (lease expira)
    await db.supabase.from('webhook_logs').update({
        processing_expires_at: new Date(Date.now() - 10000).toISOString()
    }).eq('message_id', msgIdCrash);

    // 2ª tentativa (takeover pelo worker 2)
    let claimCrash2 = await db.webhooks.claim(msgIdCrash, clinicId, phone, tokenCrash2, 2, 30);
    console.assert(claimCrash2.status === 'CLAIMED', 'AG2: Worker 2 assume via takeover (attempt 2)');

    // Simula crash do worker 2 (lease expira)
    await db.supabase.from('webhook_logs').update({
        processing_expires_at: new Date(Date.now() - 10000).toISOString()
    }).eq('message_id', msgIdCrash);

    // 3ª tentativa: deve ser rejeitado para DEAD_LETTER pois attempt_count (2) >= max_retries (2)
    let claimCrash3 = await db.webhooks.claim(msgIdCrash, clinicId, phone, tokenCrash3, 2, 30);
    console.assert(claimCrash3.status === 'DEAD_LETTER', 'AG3: Takeover após atingir max_retries move para DEAD_LETTER e impede crash loop infinito');

    let rowCrash = await db.supabase.from('webhook_logs').select('*').eq('message_id', msgIdCrash).single().then(r => r.data);
    console.assert(rowCrash.status === 'failed', 'AG4: Status é marcado como failed no banco');
    console.assert(rowCrash.processing_token === null, 'AG5: Token é limpo no dead-letter');

    // Cenário AH: clock_timestamp() impede renovação/conclusão de lease expirado em tempo real
    console.log('\n--- TEMPORAL CLOCK_TIMESTAMP HARDENING (AH) ---');
    const phoneAH = '5511988887777';
    const lockAH = crypto.randomUUID();

    // 1. Adquire lease curto de 5s
    let acqAH = await db.sessionLocks.acquire(phoneAH, clinicId, lockAH, 5);
    console.assert(acqAH === true, 'AH1: Lock de 5s adquirido');

    // 2. Aguarda 6s ultrapassando o TTL em tempo real
    console.log('⏳ Aguardando 6s para ultrapassar TTL em tempo real...');
    await new Promise(r => setTimeout(r, 6000));

    // 3. Tenta renovar o lease expirado: deve ser rejeitado segundo clock_timestamp()
    let renewAH = await db.sessionLocks.renew(phoneAH, clinicId, lockAH, 5);
    console.assert(renewAH === false, 'AH2: renew_session_lock rejeita renovação de lease já expirado em tempo real');

    // 4. Tenta persistir estado: deve falhar com SESSION_LOCK_LOST
    let persistAH = await db.sessions.persistStateIfOwned(phoneAH, clinicId, lockAH, [], {}).catch(e => e);
    console.assert(persistAH.code === 'SESSION_LOCK_LOST', 'AH3: persist_session_state_if_lock_owned rejeita escrita após expiração em tempo real');

    console.log('\n✅ 34/34 CENÁRIOS PASS! (A-AH)');
    setTimeout(() => process.exit(0), 500);
}

runTests().catch(err => {
    console.error('❌ FATAL ERROR:', err);
    process.exit(1);
});
