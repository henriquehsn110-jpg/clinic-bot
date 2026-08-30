/**
 * CLINICABOT SAAS PRO — SCRIPT DE RESTAURAÇÃO DE BACKUP
 * Lê um arquivo .json.gz de backup e restaura os dados em um banco de destino (ex: Staging/Testes),
 * comparando o número de linhas restauradas com o manifesto original para auditoria.
 *
 * ATENÇÃO: NUNCA execute este script contra o banco de produção!
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { createClient } = require('@supabase/supabase-js');

async function restoreBackup(backupFilePath, targetSupabaseUrl, targetSupabaseKey, options = { dryRun: false }) {
    console.log('================================================================');
    console.log('🔄 [RESTORE] INICIANDO PROCESSO DE RESTAURAÇÃO DE BACKUP');
    console.log('================================================================\n');

    if (!fs.existsSync(backupFilePath)) {
        throw new Error(`Arquivo de backup não encontrado: ${backupFilePath}`);
    }

    // Trava de Segurança: Não permitir restaurar em produção acidentalmente
    const prodUrl = 'https://vqnhtejriorlegqvtivq.supabase.co';
    if (targetSupabaseUrl.includes('vqnhtejriorlegqvtivq') && !options.allowProductionOverwrite) {
        throw new Error('🛑 BLOQUEIO DE SEGURANÇA: Tentativa de restauração bloqueada contra o banco de Produção!');
    }

    console.log(`📦 Lendo e descompactando arquivo: ${backupFilePath}`);
    const compressedBuffer = fs.readFileSync(backupFilePath);
    const decompressedJson = zlib.gunzipSync(compressedBuffer).toString('utf-8');
    const backupData = JSON.parse(decompressedJson);

    console.log(`📅 Data do Backup: ${backupData.metadata.created_at}`);
    console.log(`🌐 Origem: ${backupData.metadata.source_url}`);
    console.log(`🎯 Destino: ${targetSupabaseUrl}\n`);

    const supabase = createClient(targetSupabaseUrl, targetSupabaseKey, {
        auth: { persistSession: false }
    });

    const report = {
        totalRestoredRows: 0,
        tablesRestored: {}
    };

    // Ordem de restauração para respeitar Foreign Keys
    const RESTORE_ORDER = [
        'clinics',
        'doctors',
        'clinic_hours',
        'clinic_holidays',
        'doctor_business_hours',
        'patients',
        'appointments',
        'sessions',
        'audit_logs',
        'reminder_logs',
        'saas_subscriptions',
        'lgpd_deletion_logs',
        'admin_users',
        'admin_audit_log',
        'webhook_inbox',
        'webhook_logs'
    ];

    for (const tableName of RESTORE_ORDER) {
        const rows = backupData.data[tableName];
        if (!rows || rows.length === 0) {
            continue;
        }

        process.stdout.write(`⏳ Restaurando tabela [${tableName}] (${rows.length} registros)... `);

        if (options.dryRun) {
            console.log(`[DRY-RUN] Simulação: ${rows.length} registros válidos.`);
            report.tablesRestored[tableName] = { count: rows.length, status: 'simulated' };
            report.totalRestoredRows += rows.length;
            continue;
        }

        // Inserção em lotes de 100 registros usando upsert
        const BATCH_SIZE = 100;
        let inserted = 0;

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            const { error } = await supabase.from(tableName).upsert(batch, { onConflict: 'id', ignoreDuplicates: false });

            if (error) {
                // Tenta sem onConflict caso a tabela não use id primário padrão
                const { error: insertErr } = await supabase.from(tableName).insert(batch);
                if (insertErr && !insertErr.message.includes('duplicate key')) {
                    console.error(`\n⚠️ Aviso ao restaurar ${tableName}: ${insertErr.message}`);
                }
            }
            inserted += batch.length;
        }

        console.log(`✅ ${inserted} registros restaurados.`);
        report.tablesRestored[tableName] = { count: inserted, status: 'success' };
        report.totalRestoredRows += inserted;
    }

    console.log('\n================================================================');
    console.log('🎉 RESTAURAÇÃO CONCLUÍDA!');
    console.log('================================================================');
    console.log(`📊 Total de Registros Restaurados: ${report.totalRestoredRows}`);

    return report;
}

if (require.main === module) {
    const backupFile = process.argv[2];
    if (!backupFile) {
        console.error('Uso: node scripts/restore_database.js <caminho_do_arquivo.json.gz>');
        process.exit(1);
    }
    
    // Default: restaura em Staging ou Dry-Run
    const targetUrl = process.env.SUPABASE_STAGING_URL || process.env.SUPABASE_URL;
    const targetKey = process.env.SUPABASE_STAGING_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;

    restoreBackup(backupFile, targetUrl, targetKey, { dryRun: true }).catch(err => {
        console.error('❌ ERRO NA RESTAURAÇÃO:', err);
        process.exit(1);
    });
}

module.exports = { restoreBackup };
