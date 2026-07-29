const fs = require('fs');
let html = fs.readFileSync('public/dashboard.html', 'utf8');

// 1. Substituir o bloco <style> pelo link do CSS
html = html.replace(/<style>[\s\S]*?<\/style>/, '<link rel="stylesheet" href="/index.css">');

// 2. Adicionar o Botão da Aba de CRM
if (!html.includes('switchTab(\'crm\'')) {
    html = html.replace(
        '<button class="tab-btn" onclick="switchTab(\'settings\', this)"><i class="fa-solid fa-sliders"></i> Configurações da IA & WhatsApp</button>',
        '<button class="tab-btn" onclick="switchTab(\'crm\', this)"><i class="fa-solid fa-bullhorn"></i> CRM & Remarketing</button>\n            <button class="tab-btn" onclick="switchTab(\'settings\', this)"><i class="fa-solid fa-sliders"></i> Configurações da IA & WhatsApp</button>'
    );
}

// 3. Adicionar o HTML da aba CRM e atualizar a aba Handoff com AI Summary
const crmSection = `
        <!-- TAB 6: CRM & REMARKETING -->
        <div id="tab-crm" class="section-card" style="display: none;">
            <div class="crm-action-bar">
                <div class="crm-text">
                    <h4><i class="fa-solid fa-bullseye"></i> Recuperação de Abandonos & No-Shows</h4>
                    <p>IA identificou pacientes que iniciaram agendamento mas não concluíram ou que desmarcaram recentemente.</p>
                </div>
                <button class="btn btn-primary" onclick="alert('Funcionalidade de Disparo em Massa iniciada! A IA enviará mensagens de reengajamento.')">
                    <i class="fa-solid fa-paper-plane"></i> Disparar Campanha de Retorno
                </button>
            </div>
            
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>Paciente</th>
                            <th>Última Interação</th>
                            <th>Motivo/Status</th>
                            <th>Ação IA</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>João Silva (11 9999-8888)</td>
                            <td>Há 2 horas</td>
                            <td><span class="status-pill cancelled">Abandono no Funil</span></td>
                            <td><button class="btn" title="Enviar Lembrete"><i class="fa-solid fa-bolt"></i> Reengajar</button></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
`;

if (!html.includes('id="tab-crm"')) {
    html = html.replace('<!-- MODALS -->', crmSection + '\n        <!-- MODALS -->');
}

// 4. Update the handoff list to include the Executive AI Summary
html = html.replace(
    /let html = '';\s*handoffs\.forEach\(h => \{/g,
    `let html = '';\n                handoffs.forEach(h => {\n                    let summary = h.notes ? h.notes : "A IA não conseguiu concluir o agendamento devido a uma exceção complexa ou pedido de falar com atendente.";`
);

html = html.replace(
    /<div class="handoff-notes">\$?\{?h\.notes.*?<\/div>/,
    `<div class="ai-summary-box animate-in"><div class="ai-summary-title"><i class="fa-solid fa-brain"></i> Resumo Executivo da IA</div>\${summary}</div>`
);

fs.writeFileSync('public/dashboard.html', html);
console.log('UI Dashboard estruturalmente atualizado para versão Premium!');
