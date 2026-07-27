---
name: whatsapp-flow-simulator
description: Guia de simulação de fluxos conversacionais no WhatsApp com a IA "Ana" (agendamentos, confirmações, cancelamentos e fuso BRT) no ClinicaBot SaaS Pro.
---

# 💬 ClinicaBot — WhatsApp Flow Simulator Skill (`whatsapp-flow-simulator`)

Esta skill orienta a execução e simulação dos fluxos de diálogo da inteligência conversacional "Ana" no simulador web local e na API de mensageria do **ClinicaBot SaaS Pro**.

---

## 1. Fluxos Conversacionais Mapeados

### 1.1 Agendamento de Consulta
1. **Mensagem Inicial do Paciente**: "Gostaria de agendar uma consulta para amanhã."
2. **Resposta da IA Ana**: Solicita especialidade ou médico e confirma horários disponíveis.
3. **Persistência**: Grava a sessão em `conversation_state` e atualiza o agendamento no Supabase no fuso `America/Sao_Paulo` (BRT).

### 1.2 Confirmação Automática de Presença (Lembretes)
1. **Gatilho**: Disparo automático diário às 08:00 AM (BRT) via `reminderService`.
2. **Resposta Direta**: Se o paciente responder `"confirmar"` ou `"Confirmar"`, a consulta é marcada diretamente como `confirmed`.
3. **Interpretação NLU (Gemini)**: Se o paciente responder variações como `"sim"`, `"pode ser"`, `"confirmo"` ou `"👍"`, o texto é enviado para interpretação da IA.

### 1.3 Remarcação & Cancelamento
1. **Remarcação**: Libera o horário anterior e sugere os próximos slots disponíveis no calendário da clínica.
2. **Cancelamento**: Atualiza status para `cancelled` e disponibiliza a vaga no painel da recepção.

---

## 2. Comandos de Teste e Simulação

```bash
# Inicia o servidor local com o simulador web em http://localhost:3000/simulator/index.html
node clinic-bot-backend/server.js

# Executa os testes unitários do fluxo de lembretes e confirmações
node clinic-bot-backend/tests/test_reminders.js
```
