require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

const SQL = `
  ALTER TABLE patients ADD COLUMN IF NOT EXISTS cpf VARCHAR(14) UNIQUE;
  CREATE INDEX IF NOT EXISTS idx_patients_cpf ON patients (cpf);
`;

async function runMigration() {
    console.log('🔄 Executando migração: adicionando coluna cpf...');
    
    try {
        // Tenta via endpoint pg-meta (disponível em projetos Supabase)
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
            method: 'POST',
            headers: {
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: SQL })
        });

        if (response.ok) {
            console.log('✅ Migração concluída com sucesso via RPC!');
            return true;
        }
        
        console.log(`⚠️ RPC retornou ${response.status}. Tentando método alternativo...`);
    } catch (err) {
        console.log('⚠️ Endpoint RPC indisponível:', err.message);
    }

    // Método alternativo: usa pg-meta query endpoint
    try {
        const response = await fetch(`${SUPABASE_URL}/pg/query`, {
            method: 'POST',
            headers: {
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: SQL })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Migração concluída com sucesso via pg-meta!');
            console.log('Resultado:', JSON.stringify(data));
            return true;
        }
        
        console.log(`⚠️ pg-meta retornou ${response.status}: ${await response.text()}`);
    } catch (err) {
        console.log('⚠️ pg-meta indisponível:', err.message);
    }

    console.log('\n❌ Não foi possível executar a migração automaticamente.');
    console.log('📋 Execute manualmente no SQL Editor do Supabase:');
    console.log('─'.repeat(50));
    console.log(SQL);
    console.log('─'.repeat(50));
    return false;
}

runMigration();
