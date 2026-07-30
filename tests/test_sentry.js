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
            console.log('✨ Erro capturado pelo Sentry e enviado para o painel em tempo real!');
            server.kill();
            process.exit(0);
        });
    }
});

server.stderr.on('data', data => {
    console.log('[SERVER ERR]', data.toString().trim());
});
