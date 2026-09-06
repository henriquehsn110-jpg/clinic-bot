/**
 * CLINICABOT SAAS PRO — SCRIPT DE BACKUP AUTOMATIZADO DE PRODUÇÃO
 * Exporta integralmente todas as tabelas públicas via SDK do Supabase (Service Role),
 * com paginação segura (chunks de 1000 linhas), cálculo de checksum SHA-256 e compactação GZIP.
 */
const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../.env') });
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function getFormattedDate() {
    const now = new Date();
    const brtString = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const brtDate = new Date(brtString);

    const year = brtDate.getFullYear();
    const month = String(brtDate.getMonth() + 1).padStart(2, '0');
    const day = String(brtDate.getDate()).padStart(2, '0');
    const hours = String(brtDate.getHours()).padStart(2, '0');
    const minutes = String(brtDate.getMinutes()).padStart(2, '0');

    return {
        timestampIso: brtDate.toISOString(),
        dateStr: `${year}-${month}-${day}`,
        fileTimestamp: `${year}-${month}-${day}_${hours}-${minutes}`
    };
}

// Lista de tabelas a serem exportadas
const TARGET_TABLES = [
    'clinics',
    'patients',
    'appointments',
    'sessions',
    'doctors',
    'clinic_hours',
    'clinic_holidays',
    'doctor_business_hours',
    'audit_logs',
    'reminder_logs',
    'saas_subscriptions',
    'lgpd_deletion_logs',
    'admin_users',
    'admin_audit_log',
    'webhook_inbox',
    'webhook_logs'
];

async function fetchTableData(supabase, tableName) {
    let rows = [];
    let from = 0;
    const CHUNK_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(from, from + CHUNK_SIZE - 1);

        if (error) {
            // Se tabela não existe no schema atual, ignora
            if (error.message.includes('Could not find the table') || error.code === 'PGRST205') {
                return { exists: false, count: 0, rows: [] };
            }
            throw new Error(`Erro ao exportar tabela ${tableName}: ${error.message}`);
        }

        if (!data || data.length === 0) {
            hasMore = false;
        } else {
            rows = rows.concat(data);
            if (data.length < CHUNK_SIZE) {
                hasMore = false;
            } else {
                from += CHUNK_SIZE;
            }
        }
    }

    return { exists: true, count: rows.length, rows };
}

async function runBackup() {
    console.log('================================================================');
    console.log('🛡️ [BACKUP] INICIANDO ROTINA DE BACKUP AUTOMATIZADO DE PRODUÇÃO');
    console.log('================================================================\n');

    const supabaseUrl = process.env.SUPABASE_URL || 'https://vqnhtejriorlegqvtivq.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_STAGING_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ ERRO CRÍTICO: SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurados nas variáveis de ambiente!');
        console.error('ℹ️ Dica: Configure o segredo SUPABASE_SERVICE_KEY no repositório GitHub (Settings > Secrets and variables > Actions).');
        process.exit(1);
    }

    console.log(`📡 Conectando ao Supabase: ${supabaseUrl}`);
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
    });

    const { timestampIso, dateStr, fileTimestamp } = getFormattedDate();
    const backupDir = path.resolve(__dirname, '../backups');

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupPayload = {
        metadata: {
            source_url: supabaseUrl,
            created_at: timestampIso,
            version: '2.0.0',
            tables_summary: {}
        },
        data: {}
    };

    let totalExportedRows = 0;

    for (const tableName of TARGET_TABLES) {
        process.stdout.write(`⏳ Exportando tabela [${tableName}]... `);
        const { exists, count, rows } = await fetchTableData(supabase, tableName);

        if (!exists) {
            console.log(`(Tabela não existe no schema, ignorada)`);
            continue;
        }

        backupPayload.data[tableName] = rows;
        backupPayload.metadata.tables_summary[tableName] = {
            rowCount: count,
            sha256: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex')
        };
        totalExportedRows += count;
        console.log(`✅ ${count} registros exportados.`);
    }

    // Serialização e Compactação GZIP
    const jsonContent = JSON.stringify(backupPayload, null, 2);
    const compressedBuffer = zlib.gzipSync(Buffer.from(jsonContent, 'utf-8'));

    const rawFileName = `backup_production_${fileTimestamp}.json`;
    const gzFileName = `backup_production_${fileTimestamp}.json.gz`;
    const gzFilePath = path.join(backupDir, gzFileName);

    fs.writeFileSync(gzFilePath, compressedBuffer);

    const fileStats = fs.statSync(gzFilePath);
    const fileSizeKb = (fileStats.size / 1024).toFixed(2);

    console.log('\n================================================================');
    console.log('🎉 BACKUP CONCLUÍDO COM SUCESSO!');
    console.log('================================================================');
    console.log(`📁 Arquivo Gerado: ${gzFilePath}`);
    console.log(`📦 Tamanho Compactado: ${fileSizeKb} KB`);
    console.log(`📊 Total de Registros Exportados: ${totalExportedRows}`);
    console.log(`🔒 Checksum do Arquivo: ${crypto.createHash('sha256').update(compressedBuffer).digest('hex')}`);

    // Limpeza de Retenção (Manter últimos 14 dias)
    cleanOldBackups(backupDir, 14);

    return {
        filePath: gzFilePath,
        fileName: gzFileName,
        fileSizeKb,
        totalRows: totalExportedRows,
        summary: backupPayload.metadata.tables_summary
    };
}

function cleanOldBackups(dir, retentionDays = 14) {
    const files = fs.readdirSync(dir);
    const now = Date.now();
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    files.forEach(file => {
        if (file.startsWith('backup_production_') && (file.endsWith('.json.gz') || file.endsWith('.sql.gz'))) {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > maxAgeMs) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        }
    });

    if (deletedCount > 0) {
        console.log(`🧹 Política de Retenção: ${deletedCount} backups com mais de ${retentionDays} dias removidos.`);
    }
}

if (require.main === module) {
    runBackup().catch(err => {
        console.error('❌ FALHA CRÍTICA NA EXECUÇÃO DO BACKUP:', err);
        process.exit(1);
    });
}

module.exports = { runBackup, fetchTableData };
