const fs = require('fs');
const http = require('http');

const run_id = 'qa_1784558843';
const phone = '5511900000001';

async function sim(msg) {
    return new Promise((resolve, reject) => {
        const req = http.request('http://localhost:3000/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.write(JSON.stringify({ phone, text: msg }));
        req.end();
    });
}

async function run() {
    console.log('--- TESTE 1: Paciente Novo + Outro Flow ---');
    await new Promise((resolve, reject) => {
        http.get(`http://localhost:3000/api/simulate/reset?phone=${phone}`, (res) => {
            res.on('data', () => {});
            res.on('end', resolve);
        }).on('error', reject);
    });
    
    let r = await sim('Oi');
    console.log('Bot:', r.text); // Deveria ser boas vindas
    
    r = await sim('Agendar Consulta');
    console.log('Bot:', r.text); // Deveria perguntar especialidade
    
    r = await sim('Outro');
    console.log('Bot:', r.text); // Deveria pedir descrição
    
    r = await sim('Estou com dor de dente muito forte e siso inflamado');
    console.log('Bot:', r.text); // Deveria exibir calendário

    r = await sim('Selecionei a data: 2026-07-25');
    console.log('Bot:', r.text);

    r = await sim('10:00');
    console.log('Bot:', r.text);
    
    r = await sim('Teste Nome Silva');
    console.log('Bot:', r.text);
    
    r = await sim('99999999999');
    console.log('Bot:', r.text); // Confirmação

    console.log('--- FIM TESTE 1 ---');
}
run();
