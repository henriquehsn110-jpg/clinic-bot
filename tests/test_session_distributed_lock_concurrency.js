const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../.env') });
const db = require('../services/databaseService');
const crypto = require('crypto');
const assert = require('node:assert/strict');

async function runTests() {
    console.log('🧪 Iniciando Testes V19: Sessões Distribuídas, Webhook Idempotency e Efeitos Externos (A-AH + H1-H17)...');

    // Setup de teste
    const clinic = await db.supabase.from('clinics').select('id').eq('slug', 'clinica-modelo').single().then(r => r.data);
    if (!clinic) throw new Error("Clínica modelo não encontrada.");
    const clinicId = clinic.id;
    const phone = '5511999999999';

    // Limpa estado
    await db.supabase.from('session_locks').delete().eq('clinic_id', clinicId);
    await db.supabase.from('webhook_logs').delete().neq('message_id', 'dummy');
    await db.supabase.from('message_effects').delete().neq('message_id', 'dummy');
    await db.supabase.from('webhook_inbox').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await db.supabase.from('clinics').update({ phone_number_id: 'test_phone_id' }).eq('id', clinicId);
    await db.sessions.delete(phone, clinicId);

    // ─────────────────────────────────────────────────────────────────────────────
    // TESTES DE SESSION LOCK (A-H, T, U)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- SESSION LOCKS ---');
    const lockA = crypto.randomUUID();
    const lockB = crypto.randomUUID();

    // Cenário A/B: Aquisição e Concorrência
    let acqA = await db.sessionLocks.acquire(phone, clinicId, lockA, 5);
    assert.equal(acqA, true, 'A1: Worker A deve adquirir o lock');
    let acqB = await db.sessionLocks.acquire(phone, clinicId, lockB, 5);
    assert.equal(acqB, false, 'A2: Worker B deve ser rejeitado (lock ocupado)');

    // Cenário U/AA: FOR UPDATE serializa e protege persistência
    let history = [{ role: 'user', parts: [{ text: 'oi' }] }];
    let draft = { type: 'test' };
    
    // Tenta persistir com lock errado (Teste T - Anti-TOCTOU Node)
    let persistB = await db.sessions.persistStateIfOwned(phone, clinicId, lockB, history, draft).catch(e => e);
    assert.equal(persistB.code, 'SESSION_LOCK_LOST', 'T1: Worker B não pode persistir estado sem possuir o lock');

    // Persiste com lock correto (Teste AA - Atomicidade de FSM)
    let persistA = await db.sessions.persistStateIfOwned(phone, clinicId, lockA, history, draft);
    assert.equal(persistA, true, 'AA1: Worker A persiste history+draft atomicamente');

    // Cenário W/C: Takeover após TTL
    console.log('⏳ Aguardando 6s para expirar o lease do Worker A...');
    await new Promise(r => setTimeout(r, 6000));
    let acqB_after = await db.sessionLocks.acquire(phone, clinicId, lockB, 5);
    assert.equal(acqB_after, true, 'W1: Worker B assume o lock após expiração (takeover)');

    let persistA_after = await db.sessions.persistStateIfOwned(phone, clinicId, lockA, history, draft).catch(e => e);
    assert.equal(persistA_after.code, 'SESSION_LOCK_LOST', 'C1: Worker A não pode persistir após perder lease para B');

    // ─────────────────────────────────────────────────────────────────────────────
    // TESTES DE WEBHOOK IDEMPOTENCY (I-N, V, X)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- WEBHOOK IDEMPOTENCY ---');
    const msgId = 'msg_' + Date.now();
    const tokenA = crypto.randomUUID();
    const tokenB = crypto.randomUUID();

    // Cenário I: Primeiro claim
    let claim1 = await db.webhooks.claim(msgId, clinicId, phone, tokenA, 3, 30);
    assert.equal(claim1.status, 'CLAIMED', 'I1: Primeira chamada deve ser CLAIMED');
    assert.equal(claim1.processing_token, tokenA, 'I2: Token A retornado');

    // Cenário J: Claim simultâneo (23505 evitado via FOR UPDATE)
    let claim2 = await db.webhooks.claim(msgId, clinicId, phone, tokenB, 3, 30);
    assert.equal(claim2.status, 'ALREADY_PROCESSING', 'J1: Segunda chamada imediata retorna ALREADY_PROCESSING');

    // Cenário V: Heartbeat previne takeover
    let renewWh = await db.webhooks.renew(msgId, tokenA, 5);
    assert.equal(renewWh, true, 'V1: Heartbeat renova lease');
    
    // Cenário X: Fencing após perda
    // Simula expiração do lease
    await db.supabase.from('webhook_logs').update({
        processing_expires_at: new Date(Date.now() - 10000).toISOString()
    }).eq('message_id', msgId);
    let claim3 = await db.webhooks.claim(msgId, clinicId, phone, tokenB, 3, 30);
    assert.equal(claim3.status, 'CLAIMED', 'X1: Worker B assume após lease de A expirar');
    assert.equal(claim3.processing_token, tokenB, 'X2: Token B assumiu');
    
    // A tenta completar com token antigo (deve falhar)
    let compA = await db.webhooks.complete(msgId, tokenA);
    assert.equal(compA, false, 'X3: Worker A não pode completar com token expirado/sobrescrito');

    // B completa
    let compB = await db.webhooks.complete(msgId, tokenB);
    assert.equal(compB, true, 'X4: Worker B completa com sucesso');
    
    // Verifica limpeza (Limpeza de residual)
    let whRow = await db.supabase.from('webhook_logs').select('*').eq('message_id', msgId).single().then(r => r.data);
    assert.ok(whRow.processing_token === null && whRow.processing_expires_at === null, 'X5: completed limpa token e expires_at');

    // Cenário Y: Failed é terminal
    const msgIdFail = 'msg_fail_' + Date.now();
    await db.webhooks.claim(msgIdFail, clinicId, phone, tokenA, 3, 30);
    await db.webhooks.fail(msgIdFail, tokenA, 'Simulated fatal error');
    let claimFail = await db.webhooks.claim(msgIdFail, clinicId, phone, tokenB, 3, 30);
    assert.equal(claimFail.status, 'ALREADY_FAILED', 'Y1: Estado failed é terminal e retorna ALREADY_FAILED');

    // Cenário Dead-Letter (MAX_RETRIES)
    const msgIdDl = 'msg_dl_' + Date.now();
    await db.webhooks.claim(msgIdDl, clinicId, phone, tokenA, 1, 30); // max 1
    await db.webhooks.defer(msgIdDl, tokenA, 'Retry 1', 1); // 1s backoff
    await db.supabase.from('webhook_logs').update({
        next_retry_at: new Date(Date.now() - 10000).toISOString()
    }).eq('message_id', msgIdDl);
    let claimDl = await db.webhooks.claim(msgIdDl, clinicId, phone, tokenB, 1, 30);
    assert.equal(claimDl.status, 'DEAD_LETTER', 'Y2: Exceder max_retries move para DEAD_LETTER');

    // ─────────────────────────────────────────────────────────────────────────────
    // TESTES DE MESSAGE EFFECTS (Z, AB, AC, AD, AE)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- MESSAGE EFFECTS ---');
    const effectKey = 'whatsapp_send_1';
    const effTokenA = crypto.randomUUID();
    const effTokenB = crypto.randomUUID();

    // Cenário AD: Execução concorrente
    let effClaimA = await db.effects.claim(msgId, 'whatsapp', effectKey, effTokenA, 30, 3);
    assert.equal(effClaimA.status, 'CLAIMED', 'AD1: Worker A ganha claim do effect');
    let effClaimB = await db.effects.claim(msgId, 'whatsapp', effectKey, effTokenB, 30, 3);
    assert.equal(effClaimB.status, 'ALREADY_PROCESSING', 'AD2: Worker B bloqueado');

    // Cenário AB: Crash após claim (simula expiração de lease)
    await db.supabase.from('message_effects').update({
        effect_expires_at: new Date(Date.now() - 10000).toISOString()
    }).eq('message_id', msgId);
    let effClaimB_takeover = await db.effects.claim(msgId, 'whatsapp', effectKey, effTokenB, 30, 3);
    assert.equal(effClaimB_takeover.status, 'CLAIMED', 'AB1: Worker B assume o effect após expirar (crash simulation)');
    let effRowAB = await db.supabase.from('message_effects').select('*').eq('message_id', msgId).single().then(r=>r.data);
    assert.equal(effRowAB.attempt_count, 2, 'AB2: attempt_count deve incrementar para 2 após takeover');

    // Cenário AC: Worker A tenta marcar como executed após perder lease
    let markA = await db.effects.markExecuted(msgId, 'whatsapp', effectKey, effTokenA);
    assert.equal(markA, false, 'AC1: Worker A não pode marcar executed sem o token correto');
    
    // Worker B marca executed
    let markB = await db.effects.markExecuted(msgId, 'whatsapp', effectKey, effTokenB);
    assert.equal(markB, true, 'Z2.1: Worker B marca executed');
    let effRowZ = await db.supabase.from('message_effects').select('*').eq('message_id', msgId).single().then(r=>r.data);
    assert.equal(effRowZ.effect_token, null, 'Z2.2: markExecuted limpa effect_token');

    // Cenário AF: Defer incrementa attempt_count e Fail é terminal
    const effFail = 'whatsapp_fail';
    let effClaimC = await db.effects.claim(msgId, 'whatsapp', effFail, effTokenA, 30, 2);
    await db.effects.defer(msgId, 'whatsapp', effFail, effTokenA, 'Network issue', 1); // 1s backoff
    await db.supabase.from('message_effects').update({
        next_retry_at: new Date(Date.now() - 10000).toISOString()
    }).eq('effect_key', effFail);
    let effClaimC2 = await db.effects.claim(msgId, 'whatsapp', effFail, effTokenB, 30, 2);
    assert.equal(effClaimC2.status, 'CLAIMED', 'AF1: Segundo claim permitido após defer');
    let effRowAF = await db.supabase.from('message_effects').select('*').eq('effect_key', effFail).single().then(r=>r.data);
    assert.equal(effRowAF.attempt_count, 2, 'AF2: Defer + Claim incrementa attempt_count');
    
    await db.effects.fail(msgId, 'whatsapp', effFail, effTokenB, 'Fatal');
    let effClaimC3 = await db.effects.claim(msgId, 'whatsapp', effFail, effTokenA, 30, 2);
    assert.equal(effClaimC3.status, 'ALREADY_FAILED', 'AF3: Fail é terminal em effects');

    // Cenário AG: Proteção contra crash loop durante processing (Takeovers sucessivos atingem DEAD_LETTER)
    const msgIdCrash = 'msg_crash_' + Date.now();
    const tokenCrash1 = crypto.randomUUID();
    const tokenCrash2 = crypto.randomUUID();
    const tokenCrash3 = crypto.randomUUID();

    // 1ª tentativa (claim inicial com max_retries = 2)
    let claimCrash1 = await db.webhooks.claim(msgIdCrash, clinicId, phone, tokenCrash1, 2, 30);
    assert.equal(claimCrash1.status, 'CLAIMED', 'AG1: 1ª tentativa de claim bem-sucedida');

    // Simula crash do worker 1 (lease expira)
    await db.supabase.from('webhook_logs').update({
        processing_expires_at: new Date(Date.now() - 10000).toISOString()
    }).eq('message_id', msgIdCrash);

    // 2ª tentativa (takeover pelo worker 2)
    let claimCrash2 = await db.webhooks.claim(msgIdCrash, clinicId, phone, tokenCrash2, 2, 30);
    assert.equal(claimCrash2.status, 'CLAIMED', 'AG2: Worker 2 assume via takeover (attempt 2)');

    // Simula crash do worker 2 (lease expira)
    await db.supabase.from('webhook_logs').update({
        processing_expires_at: new Date(Date.now() - 10000).toISOString()
    }).eq('message_id', msgIdCrash);

    // 3ª tentativa: deve ser rejeitado para DEAD_LETTER pois attempt_count (2) >= max_retries (2)
    let claimCrash3 = await db.webhooks.claim(msgIdCrash, clinicId, phone, tokenCrash3, 2, 30);
    assert.equal(claimCrash3.status, 'DEAD_LETTER', 'AG3: Takeover após atingir max_retries move para DEAD_LETTER e impede crash loop infinito');

    let rowCrash = await db.supabase.from('webhook_logs').select('*').eq('message_id', msgIdCrash).single().then(r => r.data);
    assert.equal(rowCrash.status, 'failed', 'AG4: Status é marcado como failed no banco');
    assert.equal(rowCrash.processing_token, null, 'AG5: Token é limpo no dead-letter');

    // Cenário AH: clock_timestamp() impede renovação/conclusão de lease expirado em tempo real
    console.log('\n--- TEMPORAL CLOCK_TIMESTAMP HARDENING (AH) ---');
    const phoneAH = '5511988887777';
    const lockAH = crypto.randomUUID();

    // 1. Adquire lease curto de 5s
    let acqAH = await db.sessionLocks.acquire(phoneAH, clinicId, lockAH, 5);
    assert.equal(acqAH, true, 'AH1: Lock de 5s adquirido');

    // 2. Aguarda 6s ultrapassando o TTL em tempo real
    console.log('⏳ Aguardando 6s para ultrapassar TTL em tempo real...');
    await new Promise(r => setTimeout(r, 6000));

    // 3. Tenta renovar o lease expirado: deve ser rejeitado segundo clock_timestamp()
    let renewAH = await db.sessionLocks.renew(phoneAH, clinicId, lockAH, 5);
    assert.equal(renewAH, false, 'AH2: renew_session_lock rejeita renovação de lease já expirado em tempo real');

    // 4. Tenta persistir estado: deve falhar com SESSION_LOCK_LOST
    let persistAH = await db.sessions.persistStateIfOwned(phoneAH, clinicId, lockAH, [], {}).catch(e => e);
    assert.equal(persistAH.code, 'SESSION_LOCK_LOST', 'AH3: persist_session_state_if_lock_owned rejeita escrita após expiração em tempo real');

    // ─────────────────────────────────────────────────────────────────────────────
    // TESTES ADICIONAIS DE HARDENING V19 (H1 - H7)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- HARDENING V19 INTEGRATION (H1 - H7) ---');

    // H1: Inbox deferred é reprocessado (requeue do inbox e consumo por claim_webhook_inbox)
    console.log('Testing H1: Inbox deferred é reprocessado...');
    const inboxTestPayload = {
        object: 'whatsapp_business_account',
        entry: [{
            id: 'test_entry_' + Date.now(),
            changes: [{
                value: {
                    messaging_product: 'whatsapp',
                    metadata: { phone_number_id: 'test_phone_id' },
                    messages: [{ id: 'wamid_test_inbox_' + Date.now(), from: phone, text: { body: 'teste inbox' } }]
                }
            }]
        }]
    };
    await db.webhooks.addToInbox(inboxTestPayload);
    const pendingBatch1 = await db.webhooks.fetchPending(10);
    const claimedInboxItem = pendingBatch1.find(i => JSON.stringify(i.payload).includes(inboxTestPayload.entry[0].id));
    assert.ok(claimedInboxItem, 'H1.1: claim_webhook_inbox reivindica item com status pending');

    // Simula deferimento de mensagem e requeue do inbox para status='pending'
    await db.webhooks.updateInboxStatus(claimedInboxItem.id, 'pending', 'Mensagem diferida/em retry');
    const pendingBatch2 = await db.webhooks.fetchPending(10);
    const requeuedItem = pendingBatch2.find(i => i.id === claimedInboxItem.id);
    assert.ok(requeuedItem, 'H1.2: Item requeued com status pending é consumido novamente por claim_webhook_inbox');
    await db.webhooks.updateInboxStatus(claimedInboxItem.id, 'completed');
    await db.supabase.from('webhook_inbox').delete().eq('id', claimedInboxItem.id);

    // H2: Efeito already_processing aborta webhook com defer
    console.log('Testing H2: Efeito already_processing aborta webhook com defer...');
    const msgIdH2 = 'msg_h2_' + Date.now();
    const tokenH2 = crypto.randomUUID();
    const effKeyH2 = 'whatsapp:welcome';
    await db.webhooks.claim(msgIdH2, clinicId, phone, tokenH2, 3, 30);
    await db.effects.claim(msgIdH2, 'whatsapp_message', effKeyH2, crypto.randomUUID(), 30, 3);
    
    let caughtRetryErr = null;
    try {
        await db.executeGuardedEffect({
            messageId: msgIdH2,
            effectType: 'whatsapp_message',
            effectKey: effKeyH2,
            executeFn: async () => ({ sent: true })
        });
    } catch (err) {
        caughtRetryErr = err;
    }
    assert.ok(caughtRetryErr && caughtRetryErr.isRetryable === true, 'H2.1: executeGuardedEffect lança erro retryable quando claim é ALREADY_PROCESSING');
    await db.webhooks.defer(msgIdH2, tokenH2, caughtRetryErr.message, 5);
    const whRowH2 = await db.supabase.from('webhook_logs').select('status').eq('message_id', msgIdH2).single().then(r => r.data);
    assert.equal(whRowH2.status, 'deferred', 'H2.2: Webhook é diferido (status deferred) quando efeito está ALREADY_PROCESSING');

    // H3: Already_executed não reenvia (safe skip)
    console.log('Testing H3: Already_executed não reenvia...');
    const msgIdH3 = 'msg_h3_' + Date.now();
    const effKeyH3 = 'whatsapp:confirm_prompt';
    let h3ExecutionCount = 0;
    const testExecFnH3 = async () => {
        h3ExecutionCount++;
        return { messageId: 'out_msg_123' };
    };
    const firstExec = await db.executeGuardedEffect({
        messageId: msgIdH3,
        effectType: 'whatsapp_message',
        effectKey: effKeyH3,
        executeFn: testExecFnH3
    });
    assert.equal(firstExec.status, 'EXECUTED', 'H3.1: 1ª execução do efeito é EXECUTED');
    assert.equal(h3ExecutionCount, 1, 'H3.2: executeFn foi executada 1 vez');
    
    const secondExec = await db.executeGuardedEffect({
        messageId: msgIdH3,
        effectType: 'whatsapp_message',
        effectKey: effKeyH3,
        executeFn: testExecFnH3
    });
    assert.equal(secondExec.status, 'ALREADY_EXECUTED', 'H3.3: 2ª execução retorna status ALREADY_EXECUTED');
    assert.equal(secondExec.skipped, true, 'H3.4: 2ª execução tem skipped = true');
    assert.equal(h3ExecutionCount, 1, 'H3.5: executeFn NÃO foi reexecutada (zero duplicação)');

    // H4: Perda de lease de webhook impede side effect
    console.log('Testing H4: Perda de lease de webhook impede side effect...');
    const msgIdH4 = 'msg_h4_' + Date.now();
    let h4Executed = false;
    let h4LeaseActive = false; // Lease do webhook perdida
    let caughtLeaseErr = null;
    try {
        await db.executeGuardedEffect({
            messageId: msgIdH4,
            effectType: 'whatsapp_message',
            effectKey: 'whatsapp:ask_cpf',
            checkLeaseValid: () => h4LeaseActive,
            executeFn: async () => {
                h4Executed = true;
                return { sent: true };
            }
        });
    } catch (err) {
        caughtLeaseErr = err;
    }
    assert.ok(caughtLeaseErr && caughtLeaseErr.code === 'WEBHOOK_LEASE_LOST', 'H4.1: executeGuardedEffect lança WEBHOOK_LEASE_LOST quando checkLeaseValid() é falso');
    assert.equal(h4Executed, false, 'H4.2: Side effect externo não foi disparado após perda de lease do webhook');

    // H5: Handoff persiste com lock correto
    console.log('Testing H5: Handoff persiste com lock correto...');
    const conversationController = require('../controllers/conversationController');
    const phoneH5 = '5511977776666';
    const lockH5 = crypto.randomUUID();
    await db.sessionLocks.acquire(phoneH5, clinicId, lockH5, 30);
    const patientH5 = await db.patients.findOrCreate(phoneH5, clinicId);
    const initialHistoryH5 = [{ role: 'user', parts: [{ text: 'Preciso de ajuda humana' }] }];
    
    await conversationController.persistHumanHandoff(
        phoneH5,
        patientH5,
        initialHistoryH5,
        'Não estou conseguindo agendar',
        'Nota de Teste H5',
        clinicId,
        { lockId: lockH5 }
    );
    
    const savedSessionH5 = await db.supabase.from('sessions').select('*').eq('phone', phoneH5).eq('clinic_id', clinicId).single().then(r => r.data);
    assert.ok(savedSessionH5, 'H5.1: Sessão existe no banco');
    assert.equal(savedSessionH5.draft, null, 'H5.2: Draft foi zerado atomicamente na persistência do handoff');
    const lastMsgH5 = savedSessionH5.history[savedSessionH5.history.length - 1];
    assert.ok(lastMsgH5.parts[0].text.includes('[SISTEMA: conversa transferida para atendente humano] Nota de Teste H5'), 'H5.3: Marcador de handoff gravado com sucesso no histórico sob o lock');
    await db.sessionLocks.release(phoneH5, clinicId, lockH5);

    // H6: Handoff com lock perdido não envia mensagem (propaga SESSION_LOCK_LOST)
    console.log('Testing H6: Handoff com lock perdido não envia mensagem...');
    const phoneH6 = '5511966665555';
    const lockH6Real = crypto.randomUUID();
    const lockH6Expired = crypto.randomUUID();
    await db.sessionLocks.acquire(phoneH6, clinicId, lockH6Real, 30);
    const patientH6 = await db.patients.findOrCreate(phoneH6, clinicId);

    let h6MessageSent = false;
    let caughtHandoffErr = null;
    try {
        await conversationController.persistHumanHandoff(
            phoneH6,
            patientH6,
            [],
            'Quero falar com humano',
            '',
            clinicId,
            { lockId: lockH6Expired }
        );
        h6MessageSent = true;
    } catch (err) {
        caughtHandoffErr = err;
    }
    assert.ok(caughtHandoffErr && caughtHandoffErr.code === 'SESSION_LOCK_LOST', 'H6.1: persistHumanHandoff propaga erro SESSION_LOCK_LOST quando lockId não é o dono atual');
    assert.equal(h6MessageSent, false, 'H6.2: Efeito downstream de envio de mensagem é abortado quando lock de handoff é perdido');
    await db.sessionLocks.release(phoneH6, clinicId, lockH6Real);

    // H7: Static assertions: server.js sem attemptProcessing + controller sem whatsappService direto
    console.log('Testing H7: Static assertions (server.js sem attemptProcessing e controller sem chamadas diretas)...');
    const fs = require('fs');
    const serverPath = path.resolve(__dirname, '../server.js');
    const serverSource = fs.readFileSync(serverPath, 'utf8');
    assert.equal(
        serverSource.includes('attemptProcessing'),
        false,
        'H7.1: server.js NÃO deve conter chamadas a attemptProcessing no caminho de execução real'
    );
    assert.ok(
        serverSource.includes('db.webhooks.claim'),
        'H7.2: server.js utiliza db.webhooks.claim para lifecycle V19'
    );
    assert.ok(
        serverSource.includes('db.webhooks.complete'),
        'H7.3: server.js utiliza db.webhooks.complete para lifecycle V19'
    );

    // Verificação estática (Regra 7): nenhum envio direto fora de sendGuarded
    const controllerPath = path.resolve(__dirname, '../controllers/conversationController.js');
    const controllerSource = fs.readFileSync(controllerPath, 'utf8');
    const controllerLines = controllerSource.split(/\r?\n/);
    const directCalls = [];
    controllerLines.forEach((line, idx) => {
        if (line.includes('whatsappService.') && !line.includes("require('../services/whatsappService')")) {
            if (!line.includes('() => whatsappService.') && !line.includes('({ signal }) => whatsappService.') && !line.includes('({signal}) => whatsappService.')) {
                directCalls.push({ line: idx + 1, content: line.trim() });
            }
        }
    });
    assert.equal(
        directCalls.length,
        0,
        'H7.4: conversationController.js não deve ter chamadas a whatsappService fora de sendGuarded'
    );

    // H8: processWebhookInbox end-to-end com falha transitória e reprocessamento
    console.log('Testing H8: processWebhookInbox end-to-end com falha transitória e reprocessamento...');
    const axios = require('axios');
    const originalAxiosPost = axios.post;
    const { processWebhookInbox } = require('../server');

    const h8MsgId = 'wamid_h8_' + Date.now();
    const h8Phone = '5511988887777';
    const h8Payload = {
        object: 'whatsapp_business_account',
        entry: [{
            id: 'entry_h8_' + Date.now(),
            changes: [{
                value: {
                    messaging_product: 'whatsapp',
                    metadata: { phone_number_id: 'test_phone_id' },
                    messages: [{
                        id: h8MsgId,
                        from: h8Phone,
                        text: { body: 'olá teste h8' }
                    }]
                }
            }]
        }]
    };

    // Limpa estado anterior
    await db.sessions.delete(h8Phone, clinicId);
    const h8InboxItem = await db.webhooks.addToInbox(h8Payload);
    const h8InboxId = h8InboxItem?.id;

    // 1ª execução: Intercepta o driver de transporte (axios.post) para simular falha de rede (Regra 26)
    let simulateFail = true;
    axios.post = async function(url, data, config) {
        if (url && url.includes('messages')) {
            if (simulateFail) {
                const netErr = new Error('ECONNRESET: socket hang up');
                netErr.code = 'ECONNRESET';
                netErr.isRetryable = true;
                throw netErr;
            }
        }
        return { status: 200, data: { messages: [{ id: 'out_' + Date.now() }] } };
    };

    try {
        await processWebhookInbox();

        // Verifica que o webhook foi diferido e que o inbox item permaneceu como pending (requeue)
        const whRow1 = await db.supabase.from('webhook_logs').select('status').eq('message_id', h8MsgId).single().then(r => r.data);
        assert.ok(whRow1, 'H8.1: Registro de webhook criado');
        assert.equal(whRow1.status, 'deferred', 'H8.2: 1ª execução falha transitória resulta em status deferred');

        const inboxRow1 = await db.supabase.from('webhook_inbox').select('status').eq('id', h8InboxId).single().then(r => r.data);
        assert.ok(inboxRow1, 'H8.3: Registro no inbox encontrado');
        assert.equal(inboxRow1.status, 'pending', 'H8.3: Item do inbox permanece como pending para reprocessamento');

        // 2ª execução: axios.post agora terá sucesso (simulateFail = false)
        simulateFail = false;
        // Avança next_retry_at para simular fim do backoff tanto no webhook quanto no efeito
        const pastIso = new Date(Date.now() - 10000).toISOString();
        await db.supabase.from('webhook_logs').update({ next_retry_at: pastIso }).eq('message_id', h8MsgId);
        await db.supabase.from('message_effects').update({ next_retry_at: pastIso }).eq('message_id', h8MsgId);

        await processWebhookInbox();

        const whRow2 = await db.supabase.from('webhook_logs').select('status').eq('message_id', h8MsgId).single().then(r => r.data);
        assert.equal(whRow2.status, 'completed', 'H8.4: 2ª execução com sucesso resulta em webhook completed');

        const effectRow = await db.supabase.from('message_effects').select('status').eq('message_id', h8MsgId).eq('status', 'executed').maybeSingle().then(r => r.data);
        assert.ok(effectRow && effectRow.status === 'executed', 'H8.5: Efeito da mensagem foi marcado como executed');

        const inboxRow2 = await db.supabase.from('webhook_inbox').select('status').eq('id', h8InboxId).single().then(r => r.data);
        assert.ok(inboxRow2, 'H8.6: Registro de inbox encontrado após 2º processamento');
        assert.equal(inboxRow2.status, 'completed', 'H8.7: webhook_inbox.status === completed após segundo processamento');
    } finally {
        axios.post = originalAxiosPost;
        if (h8InboxId) {
            await db.supabase.from('webhook_inbox').delete().eq('id', h8InboxId);
        }
        await db.supabase.from('webhook_logs').delete().eq('message_id', h8MsgId);
        await db.supabase.from('message_effects').delete().eq('message_id', h8MsgId);
    }

    // H9: Webhook lease perdido = zero chamadas externas
    console.log('Testing H9: Lease perdida = zero chamadas externas (axios.post)...');
    let h9AxiosCalls = 0;
    axios.post = async function() {
        h9AxiosCalls++;
        return { status: 200, data: {} };
    };
    try {
        let caughtH9 = null;
        try {
            await db.executeGuardedEffect({
                messageId: 'msg_h9_' + Date.now(),
                effectType: 'whatsapp_message',
                effectKey: 'whatsapp:test_h9',
                checkLeaseValid: () => false,
                executeFn: () => axios.post('https://graph.facebook.com/v25.0/messages')
            });
        } catch (err) {
            caughtH9 = err;
        }
        assert.ok(caughtH9 && caughtH9.code === 'WEBHOOK_LEASE_LOST', 'H9.1: Lança WEBHOOK_LEASE_LOST');
        assert.equal(h9AxiosCalls, 0, 'H9.2: Zero chamadas ao driver axios.post após perda de lease');
    } finally {
        axios.post = originalAxiosPost;
    }

    // H10: ALREADY_EXECUTED = zero chamadas adicionais à função do efeito
    console.log('Testing H10: ALREADY_EXECUTED = zero chamadas adicionais...');
    const msgH10 = 'msg_h10_' + Date.now();
    let h10FnCalls = 0;
    const fnH10 = async () => { h10FnCalls++; return { ok: true }; };
    await db.executeGuardedEffect({
        messageId: msgH10,
        effectKey: 'whatsapp:test_h10',
        executeFn: fnH10
    });
    assert.equal(h10FnCalls, 1, 'H10.1: 1ª execução executa a função');
    const res2H10 = await db.executeGuardedEffect({
        messageId: msgH10,
        effectKey: 'whatsapp:test_h10',
        executeFn: fnH10
    });
    assert.equal(res2H10.status, 'ALREADY_EXECUTED', 'H10.2: 2ª execução retorna ALREADY_EXECUTED');
    assert.equal(h10FnCalls, 1, 'H10.3: Zero chamadas adicionais');

    // H11: Erro transitório em billing_suspended resulta em defer, NÃO completed
    console.log('Testing H11: Erro transitório em billing_suspended resulta em defer, NÃO completed...');
    const { data: suspClinic } = await db.supabase.from('clinics').insert({
        name: 'Clínica Suspensa Teste',
        slug: 'clinica-suspensa-' + Date.now(),
        phone_number_id: 'phone_susp_' + Date.now(),
        subscription_status: 'suspended'
    }).select().single();

    const h11MsgId = 'wamid_h11_' + Date.now();
    const h11Payload = {
        object: 'whatsapp_business_account',
        entry: [{
            id: 'entry_h11_' + Date.now(),
            changes: [{
                value: {
                    messaging_product: 'whatsapp',
                    metadata: { phone_number_id: suspClinic.phone_number_id },
                    messages: [{
                        id: h11MsgId,
                        from: '5511977778888',
                        text: { body: 'olá clínica suspensa' }
                    }]
                }
            }]
        }]
    };
    const h11InboxItem = await db.webhooks.addToInbox(h11Payload);

    axios.post = async function() {
        const err = new Error('ETIMEDOUT: Connection timeout');
        err.code = 'ETIMEDOUT';
        err.isRetryable = true;
        throw err;
    };
    try {
        await processWebhookInbox();
        const h11Row = await db.supabase.from('webhook_logs').select('status').eq('message_id', h11MsgId).single().then(r => r.data);
        assert.ok(h11Row, 'H11.1: Webhook log registrado');
        assert.notEqual(h11Row.status, 'completed', 'H11.2: Erro transitório em billing_suspended NÃO deve marcar webhook como completed');
        assert.equal(h11Row.status, 'deferred', 'H11.3: Webhook foi diferido para retry');
    } finally {
        axios.post = originalAxiosPost;
        if (h11InboxItem?.id) {
            await db.supabase.from('webhook_inbox').delete().eq('id', h11InboxItem.id);
        }
        await db.supabase.from('webhook_logs').delete().eq('message_id', h11MsgId);
        await db.supabase.from('message_effects').delete().eq('message_id', h11MsgId);
        await db.supabase.from('clinics').delete().eq('id', suspClinic.id);
        await db.supabase.from('clinics').update({ phone_number_id: 'test_phone_id' }).eq('id', clinicId);
    }

    // H12: Heartbeat fail-closed em renew invalida ownership e bloqueia transporte WhatsApp
    console.log('Testing H12: Heartbeat fail-closed em renew invalida ownership e bloqueia transporte...');
    const h12Phone = '5511977771212';
    const originalSessionRenew = db.sessionLocks.renew;
    let h12AxiosCalls = 0;
    axios.post = async function() {
        h12AxiosCalls++;
        return { status: 200, data: {} };
    };

    try {
        let caughtLockErr = null;

        await db.sessionLocks.withSessionLock(h12Phone, clinicId, async (lockContext) => {
            assert.equal(lockContext.isLockValid(), true, 'H12.1: Lock inicialmente válido');

            // Mock renew para lançar exceção simulando falha de rede/banco
            db.sessionLocks.renew = async () => {
                throw new Error('Database connection drop during session lock renew');
            };

            // Aguarda o heartbeat executar (ttlSeconds=5 -> intervalo ~1666ms)
            await new Promise(r => setTimeout(r, 2000));

            assert.equal(lockContext.isLockValid(), false, 'H12.2: isLockValid fica false após exceção no heartbeat');

            assert.throws(() => {
                lockContext.assertLockValid();
            }, (err) => {
                return err && err.code === 'SESSION_LOCK_LOST';
            }, 'H12.3: assertLockValid passa a lançar SESSION_LOCK_LOST');

            // Tentativa de executar envio no controller com lock perdido
            try {
                await conversationController.handleIncomingMessageUnlocked({
                    phone: h12Phone,
                    text: 'tentativa com lock perdido',
                    clinicId,
                    phoneNumberId: 'phone_test_h12'
                }, null, false, clinicId, null, lockContext);
            } catch (sendErr) {
                caughtLockErr = sendErr;
            }
        }, { ttlSeconds: 5 });

        assert.ok(caughtLockErr && caughtLockErr.code === 'SESSION_LOCK_LOST', 'H12.4: handleIncomingMessageUnlocked rejeita com SESSION_LOCK_LOST');
        assert.equal(h12AxiosCalls, 0, 'H12.5: Zero chamadas ao transporte WhatsApp quando session lock está perdido');
    } finally {
        db.sessionLocks.renew = originalSessionRenew;
        axios.post = originalAxiosPost;
        await db.sessions.delete(h12Phone, clinicId);
    }

    // H13: Effect heartbeat renova lease durante execução longa
    console.log('Testing H13: Effect heartbeat renova lease durante execução longa...');
    const msgH13 = 'msg_h13_' + Date.now();
    let renewCountH13 = 0;
    const originalRenew = db.effects.renew;
    db.effects.renew = async function(...args) {
        renewCountH13++;
        return await originalRenew.apply(this, args);
    };
    try {
        await db.executeGuardedEffect({
            messageId: msgH13,
            effectKey: 'whatsapp:test_h13',
            ttlSeconds: 6,
            executeFn: async ({ signal }) => {
                await new Promise(r => setTimeout(r, 3200));
                assert.equal(signal?.aborted, false, 'H13.1: AbortSignal não foi acionado enquanto lease válida');
                return { success: true };
            }
        });
        assert.ok(renewCountH13 >= 1, 'H13.2: Heartbeat do efeito invocou effects.renew ao menos 1 vez durante execução longa');
    } finally {
        db.effects.renew = originalRenew;
    }

    // H14: WEBHOOK_LEASE_LOST é tratado como retryable (deferred/pending)
    console.log('Testing H14: WEBHOOK_LEASE_LOST é tratado como retryable (deferred/pending)...');
    const h14Err = new Error('WEBHOOK_LEASE_LOST: lease perdida');
    h14Err.code = 'WEBHOOK_LEASE_LOST';
    const isRetryH14 = db.isRetryableTransportError(h14Err);
    assert.equal(isRetryH14, true, 'H14.1: WEBHOOK_LEASE_LOST é classificado como retryable');

    // H15: SESSION_LOCK_TIMEOUT / SESSION_LOCK_LOST é retryable
    console.log('Testing H15: SESSION_LOCK_TIMEOUT / SESSION_LOCK_LOST é retryable...');
    const h15Err1 = new Error('SESSION_LOCK_LOST'); h15Err1.code = 'SESSION_LOCK_LOST';
    const h15Err2 = new Error('SESSION_LOCK_TIMEOUT'); h15Err2.code = 'SESSION_LOCK_TIMEOUT';
    assert.equal(db.isRetryableTransportError(h15Err1), true, 'H15.1: SESSION_LOCK_LOST é retryable');
    assert.equal(db.isRetryableTransportError(h15Err2), true, 'H15.2: SESSION_LOCK_TIMEOUT é retryable');

    // H16: markExecuted=false lança EFFECT_LEASE_LOST, não completa webhook e reenfileira inbox
    console.log('Testing H16: markExecuted=false lança EFFECT_LEASE_LOST, webhook não completa e inbox é requeued/pending...');
    const originalMarkExecuted = db.effects.markExecuted;
    const h16MsgId = 'wamid_h16_' + Date.now();
    const h16Phone = '5511966661616';
    const h16Payload = {
        object: 'whatsapp_business_account',
        entry: [{
            id: 'entry_h16_' + Date.now(),
            changes: [{
                value: {
                    messaging_product: 'whatsapp',
                    metadata: { phone_number_id: 'test_phone_id' },
                    messages: [{
                        id: h16MsgId,
                        from: h16Phone,
                        text: { body: 'olá teste h16' }
                    }]
                }
            }]
        }]
    };

    await db.sessions.delete(h16Phone, clinicId);
    await db.supabase.from('webhook_logs').delete().eq('message_id', h16MsgId);
    await db.supabase.from('message_effects').delete().eq('message_id', h16MsgId);
    const h16InboxItem = await db.webhooks.addToInbox(h16Payload);
    const h16InboxId = h16InboxItem?.id;

    // Força markExecuted a retornar false (simulando perda de lease antes da finalização)
    db.effects.markExecuted = async () => false;

    // Intercepta axios.post para simular transporte OK
    axios.post = async function() {
        return { status: 200, data: { messages: [{ id: 'out_h16' }] } };
    };

    try {
        // 1. Prova direta no wrapper executeGuardedEffect:
        let wrapperResult = null;
        let caughtWrapperErr = null;
        try {
            wrapperResult = await db.executeGuardedEffect({
                messageId: 'direct_h16_' + Date.now(),
                effectKey: 'whatsapp:test_h16_direct',
                executeFn: async () => ({ ok: true })
            });
        } catch (err) {
            caughtWrapperErr = err;
        }

        assert.equal(wrapperResult, null, 'H16.1: Wrapper executeGuardedEffect NÃO retorna EXECUTED quando markExecuted=false');
        assert.ok(caughtWrapperErr && caughtWrapperErr.code === 'EFFECT_LEASE_LOST', 'H16.2: Wrapper lança EFFECT_LEASE_LOST');
        assert.equal(caughtWrapperErr?.isRetryable, true, 'H16.3: EFFECT_LEASE_LOST possui isRetryable=true');

        // 2. Prova integrada no pipeline de processWebhookInbox:
        await processWebhookInbox();

        // Webhook pai não deve virar completed (deve ser deferred)
        const whRowH16 = await db.supabase.from('webhook_logs').select('status, error_log').eq('message_id', h16MsgId).single().then(r => r.data);
        assert.ok(whRowH16, 'H16.4: Registro de webhook criado');
        assert.notEqual(whRowH16.status, 'completed', 'H16.5: Webhook pai NÃO vira completed quando efeito perde lease');
        assert.equal(whRowH16.status, 'deferred', 'H16.6: Webhook pai vira deferred');

        // Inbox item deve ser reenfileirado como pending
        const inboxRowH16 = await db.supabase.from('webhook_inbox').select('status').eq('id', h16InboxId).single().then(r => r.data);
        assert.ok(inboxRowH16, 'H16.7: Registro de inbox encontrado');
        assert.equal(inboxRowH16.status, 'pending', 'H16.8: Inbox é requeued/pending para reprocessamento seguro');
    } finally {
        db.effects.markExecuted = originalMarkExecuted;
        axios.post = originalAxiosPost;
        await db.sessions.delete(h16Phone, clinicId);
        if (h16InboxId) {
            await db.supabase.from('webhook_inbox').delete().eq('id', h16InboxId);
        }
        await db.supabase.from('webhook_logs').delete().eq('message_id', h16MsgId);
        await db.supabase.from('message_effects').delete().eq('message_id', h16MsgId);
    }

    // H17: Billing de mesma consulta permanece exatamente +1 após crash e replay
    console.log('Testing H17: Billing de mesma consulta permanece exatamente +1 após crash e replay...');
    const billingService = require('../services/billingService');
    const calendarService = require('../services/calendarService');
    const h17Phone = '5511955554444';
    const h17Date = '2028-11-20';
    const h17Time = '10:00';

    const existingPatientH17 = await db.patients.findByPhone(h17Phone, clinicId);
    if (existingPatientH17) {
        await db.supabase.from('appointments').delete().eq('patient_id', existingPatientH17.id).eq('clinic_id', clinicId);
    }

    const countBeforeH17 = await billingService.getMonthlyBookingCount(clinicId);
    await db.supabase.from('clinics').update({ monthly_booking_count: countBeforeH17 }).eq('id', clinicId);

    // 1. Appointment criado
    const appt1H17 = await calendarService.scheduleAppointment({
        clinicId,
        phone: h17Phone,
        name: 'Paciente H17',
        date: h17Date,
        time: h17Time,
        type: 'Consulta Geral'
    });
    assert.ok(appt1H17 && appt1H17.id, 'H17.1: Agendamento criado com sucesso');

    // 2. Billing aplicado
    const billed1 = await billingService.incrementMonthlyBooking(clinicId, appt1H17.id);
    assert.equal(billed1, true, 'H17.2: 1º incremento de billing executado com sucesso');

    const clinicAfter1 = await db.clinics.findById(clinicId);
    assert.equal(clinicAfter1.monthly_booking_count, countBeforeH17 + 1, 'H17.3: Contagem de billing incrementada em exatamente +1');

    // 3. Simular crash antes da persistência da sessão (draft não contém confirmed_appointment_id)
    await db.sessions.setDraft(h17Phone, {}, clinicId);

    // 4. Replay: nova chamada de scheduleAppointment (mesmo slot/paciente) e chamada incondicional de incrementMonthlyBooking
    const appt2H17 = await calendarService.scheduleAppointment({
        clinicId,
        phone: h17Phone,
        name: 'Paciente H17',
        date: h17Date,
        time: h17Time,
        type: 'Consulta Geral'
    });
    assert.equal(appt1H17.id, appt2H17.id, 'H17.4: scheduleAppointment retorna o mesmo ID (idempotência do agendamento)');

    // Chamada incondicional de replay (sem guarda de if no teste!)
    const billed2 = await billingService.incrementMonthlyBooking(clinicId, appt2H17.id);
    assert.equal(billed2, false, 'H17.5: 2ª chamada de billing rejeitada por idempotência persistente');

    // 5. Billing permanece exatamente +1
    const clinicAfter2 = await db.clinics.findById(clinicId);
    assert.equal(clinicAfter2.monthly_booking_count, countBeforeH17 + 1, 'H17.6: Billing permanece exatamente +1 após replay');

    // Teardown H17
    await db.supabase.from('appointments').delete().eq('id', appt1H17.id);
    await db.supabase.from('message_effects').delete().eq('message_id', String(appt1H17.id));
    await db.supabase.from('clinics').update({ monthly_booking_count: countBeforeH17 }).eq('id', clinicId);

    // H18: Crash/falha entre idempotency marker e incremento não perde billing
    console.log('Testing H18: Crash entre idempotency marker e incremento não perde billing...');
    const h18Phone = '5511955551818';
    const h18Date = '2028-11-22';
    const h18Time = '11:00';

    const existingPatientH18 = await db.patients.findByPhone(h18Phone, clinicId);
    if (existingPatientH18) {
        await db.supabase.from('appointments').delete().eq('patient_id', existingPatientH18.id).eq('clinic_id', clinicId);
    }

    const countBeforeH18 = await billingService.getMonthlyBookingCount(clinicId);
    await db.supabase.from('clinics').update({ monthly_booking_count: countBeforeH18 }).eq('id', clinicId);

    // 1. Appointment criado no banco
    const apptH18 = await calendarService.scheduleAppointment({
        clinicId,
        phone: h18Phone,
        name: 'Paciente H18',
        date: h18Date,
        time: h18Time,
        type: 'Consulta Geral'
    });
    assert.ok(apptH18 && apptH18.id, 'H18.1: Agendamento H18 criado com sucesso');

    // 2. Simula crash entre a inserção do marker e o incremento:
    // O marker é gravado em message_effects, mas clinics.monthly_booking_count permanece desatualizado (crash imediato)
    await db.supabase.from('message_effects').insert({
        message_id: String(apptH18.id),
        effect_type: 'billing_booking',
        effect_key: String(clinicId),
        status: 'executed',
        executed_at: new Date().toISOString()
    });

    const clinicDuringCrash = await db.clinics.findById(clinicId);
    assert.equal(clinicDuringCrash.monthly_booking_count, countBeforeH18, 'H18.2: Simulação de crash: contador ainda não havia sido incrementado');

    // 3. Sistema se recupera e reexecuta incrementMonthlyBooking para o mesmo appointment
    // A implementação anterior ignorava por 23505 e perdia o billing; a nova deriva da verdade e sincroniza
    await billingService.incrementMonthlyBooking(clinicId, apptH18.id);

    // 4. Comprova que o faturamento da clínica reflete o agendamento criado (não foi perdido)
    const clinicRecovered = await db.clinics.findById(clinicId);
    assert.equal(clinicRecovered.monthly_booking_count, countBeforeH18 + 1, 'H18.3: Billing recuperado com sucesso após crash pós-marker (+1)');

    // Teardown H18
    await db.supabase.from('appointments').delete().eq('id', apptH18.id);
    await db.supabase.from('message_effects').delete().eq('message_id', String(apptH18.id));
    await db.supabase.from('clinics').update({ monthly_booking_count: countBeforeH18 }).eq('id', clinicId);

    // H19: Dois appointments distintos concorrentes incrementam exatamente +2
    console.log('Testing H19: Dois appointments distintos concorrentes incrementam exatamente +2...');
    const h19Phone1 = '5511955551901';
    const h19Phone2 = '5511955551902';
    const h19Date = '2028-11-25';
    const h19Time1 = '09:00';
    const h19Time2 = '10:00';

    const p1 = await db.patients.findByPhone(h19Phone1, clinicId);
    if (p1) await db.supabase.from('appointments').delete().eq('patient_id', p1.id).eq('clinic_id', clinicId);
    const p2 = await db.patients.findByPhone(h19Phone2, clinicId);
    if (p2) await db.supabase.from('appointments').delete().eq('patient_id', p2.id).eq('clinic_id', clinicId);

    const countBeforeH19 = await billingService.getMonthlyBookingCount(clinicId);
    await db.supabase.from('clinics').update({ monthly_booking_count: countBeforeH19 }).eq('id', clinicId);

    // 1. Criação dos dois agendamentos distintos
    const apptH19_1 = await calendarService.scheduleAppointment({
        clinicId,
        phone: h19Phone1,
        name: 'Paciente Concorrente 1',
        date: h19Date,
        time: h19Time1,
        type: 'Consulta Geral'
    });
    const apptH19_2 = await calendarService.scheduleAppointment({
        clinicId,
        phone: h19Phone2,
        name: 'Paciente Concorrente 2',
        date: h19Date,
        time: h19Time2,
        type: 'Consulta Geral'
    });
    assert.ok(apptH19_1 && apptH19_1.id, 'H19.1: 1º agendamento concorrente criado');
    assert.ok(apptH19_2 && apptH19_2.id, 'H19.2: 2º agendamento concorrente criado');

    // 2. Disparo concorrente de billing via Promise.all
    const [billedH19_1, billedH19_2] = await Promise.all([
        billingService.incrementMonthlyBooking(clinicId, apptH19_1.id),
        billingService.incrementMonthlyBooking(clinicId, apptH19_2.id)
    ]);
    assert.equal(billedH19_1, true, 'H19.3: 1º billing concorrente processado com sucesso');
    assert.equal(billedH19_2, true, 'H19.4: 2º billing concorrente processado com sucesso');

    // 3. Comprova que clinics.monthly_booking_count foi incrementado em EXATAMENTE +2 (zero lost update)
    const clinicAfterH19 = await db.clinics.findById(clinicId);
    assert.equal(clinicAfterH19.monthly_booking_count, countBeforeH19 + 2, 'H19.5: Dois appointments concorrentes incrementaram exatamente +2');

    // Teardown H19
    await db.supabase.from('appointments').delete().in('id', [apptH19_1.id, apptH19_2.id]);
    await db.supabase.from('message_effects').delete().in('message_id', [String(apptH19_1.id), String(apptH19_2.id)]);
    await db.supabase.from('clinics').update({ monthly_booking_count: countBeforeH19 }).eq('id', clinicId);

    console.log('\n✅ 53/53 CENÁRIOS PASS! (A-AH + 19 Hardening Integration Scenarios)');
}

runTests()
    .then(() => {
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ FATAL ERROR:', err);
        process.exit(1);
    });
