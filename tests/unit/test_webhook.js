const http = require('http');

const msgData = JSON.stringify({ phone: '5511999990000', text: 'Vocês aceitam convênio Amil Dental?' });
const msgReq = http.request({
  hostname: 'localhost', port: 3000, path: '/api/simulate',
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(msgData) }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log('STATUS:', res.statusCode, '\nBODY:', body));
});
msgReq.on('error', e => console.error('ERROR:', e.message));
msgReq.write(msgData);
msgReq.end();
