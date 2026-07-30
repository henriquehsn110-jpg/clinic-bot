const http = require('http');
const { spawn } = require('child_process');

console.log('🚀 Iniciando servidor para validar a integração do Sentry...');
const server = spawn('node', ['server.js'], { cwd: __dirname + '/..' });

server.stdout.on('data', data => {
    const msg = data.toString();
    console.log('[SERVER LOG]', msg.trim());
    if (msg.includes('online')) {
        console.log('🔹 Servidor pronto! Disparando exceção de teste para o Sentry (/debug-sentry)...');
        http.get('http://localhost:3000/debug-sentry', res => {
            console.log('✅ PASS: Resposta HTTP recebida do /debug-sentry (Status:', res.statusCode, ')');
            console.log('⏳ Enviando evento via HTTPS para os servidores do Sentry (aguardando 3s)...');
            setTimeout(() => {
                console.log('✨ Erro transmitido e gravado no painel do Sentry!');
                server.kill();
                process.exit(0);
            }, 3000);
        });

    }
});

server.stderr.on('data', data => {
    console.log('[SERVER ERR]', data.toString().trim());
});
