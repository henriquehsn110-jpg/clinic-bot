# 📱 ClinicaBot SaaS Pro — Central de Simuladores do Projeto (`simulators/`)

Esta pasta reúne todos os **Simuladores de Atendimento e Teste** do ClinicaBot SaaS Pro, permitindo testar fluxos conversacionais da IA "Ana", agendamentos, transbordo humano e sincronização com o Dashboard tanto via navegador web quanto pelo terminal CLI.

---

## 📂 Estrutura da Pasta de Simuladores

```
simulators/
├── whatsapp-web/
│   └── index.html             # Simulador Web com Interface idêntica ao WhatsApp Web (Dark Mode)
├── cli-chat-simulator.js      # Simulador CLI Interativo para Terminal (Node.js)
└── README.md                  # Guia de Uso e Sincronização
```

---

## 🚀 Como Utilizar os Simuladores

### 1. Simulador WhatsApp Web (Interface Gráfica)
O simulador web permite testar visualmente todas as mensagens, botões rápidos, calendário visual e lista de horários.

- **URL Local:** `http://localhost:3000/simulator` ou `http://localhost:10000/simulator`
- **Arquivo direto:** [`simulators/whatsapp-web/index.html`](file:///c:/Users/letic/OneDrive/Desktop/ClinicaBot/simulators/whatsapp-web/index.html)

---

### 2. Simulador CLI (Terminal)
Ideal para desenvolvedores testarem conversas rapidamente sem abrir o navegador.

```bash
# Executar a partir da raiz do projeto
node simulators/cli-chat-simulator.js
```

Comandos Especiais no Terminal:
- `reiniciar`: Reseta a sessão conversacional e o rascunho de agendamento.
- `sair`: Encerra o simulador.

---

## 🔄 Protocolo de Atualização Automática e Sincronização

Sempre que novas correções, ajustes de layout ou novidades forem aplicadas nos controladores do ClinicaBot, a pasta `simulators/` é mantida como a **fonte da verdade** e sincronizada com as rotas estáticas do backend.

- **Comando de Sincronização:** `npm run sync:simulators` (configurado no `package.json`).
