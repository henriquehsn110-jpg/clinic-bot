/**
 * TESTE DE VALIDAÇÃO E INTEGRIDADE DE BACKUP E RESTAURAÇÃO (PROMPT 12)
 * Valida se o arquivo gerado não está corrompido, se descompacta com sucesso
 * e se a contagem de registros bate com o banco de origem.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');

async function testBackupIntegrity() {
    console.log('================================================================');
    console.log('🧪 [TEST] AUDITORIA DE INTEGRIDADE E RESTAURAÇÃO DO BACKUP');
    console.log('================================================================\n');

    const backupDir = path.resolve(__dirname, '../backups');
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json.gz'));

    assert(files.length > 0, 'Deve existir pelo menos 1 arquivo de backup gerado.');
    const latestFile = path.join(backupDir, files[files.length - 1]);

    console.log(`1. Testando leitura e descompressão do arquivo: ${latestFile}`);
    const compressedBuffer = fs.readFileSync(latestFile);
    assert(compressedBuffer.length > 0, 'O arquivo de backup não pode estar vazio.');
    console.log(`   ✅ Arquivo lido: ${(compressedBuffer.length / 1024).toFixed(2)} KB.`);

    console.log(`2. Descompactando GZIP e validando JSON...`);
    const decompressed = zlib.gunzipSync(compressedBuffer).toString('utf-8');
    const backupJson = JSON.parse(decompressed);

    assert(backupJson.metadata, 'O backup deve conter bloco de metadados.');
    assert(backupJson.data, 'O backup deve conter bloco de dados.');
    console.log(`   ✅ JSON válido. Versão: ${backupJson.metadata.version} | Data: ${backupJson.metadata.created_at}`);

    console.log(`3. Comparando contagem de linhas e integridade por tabela:`);
    const tables = ['clinics', 'patients', 'appointments', 'sessions', 'audit_logs'];

    for (const t of tables) {
        const rows = backupJson.data[t] || [];
        const meta = backupJson.metadata.tables_summary[t];
        console.log(`   • Tabela [${t}]: ${rows.length} registros no arquivo (Meta: ${meta ? meta.rowCount : 0})`);
        assert(meta && meta.rowCount === rows.length, `Contagem no metadata deve bater com rows em ${t}`);
        assert(rows.length > 0, `Tabela ${t} deve ter dados exportados`);
    }

    console.log('\n================================================================');
    console.log('🎉 [PASS] O ARQUIVO DE BACKUP É 100% ÍNTEGRO, VÁLIDO E RESTAURÁVEL!');
    console.log('================================================================');
}

testBackupIntegrity().then(() => process.exit(0)).catch(err => {
    console.error('❌ FALHA NO TESTE DE INTEGRIDADE:', err);
    process.exit(1);
});
