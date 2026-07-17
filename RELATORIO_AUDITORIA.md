# Relatório de Auditoria Noturna - Chatbot Clínica Odontológica

Este relatório documenta os resultados da auditoria de segurança, estabilidade e arquitetura realizada durante a madrugada, seguindo as diretrizes rigorosas (sem tocar no main, testes isolados contra banco de dados local simulado via branch isolado).

## 1. Falhas Críticas Encontradas (e Corrigidas)

### 1.1 Exposição de Dados Criptografados na Lógica de Negócio (`findByPhone`)
- **Problema:** A função `databaseService.patients.findByPhone` estava retornando o CPF criptografado diretamente do banco para a aplicação sem passar pela função `decryptData`. Isso significa que, se a IA solicitasse os dados do paciente, o hash AES-256-GCM inútil seria injetado no prompt, falhando a verificação, ou pior, gerando inconsistências no banco.
- **Risco:** Alto (Corrupção de lógica interna e falha de fluxo de agendamento em retornos).
- **Correção:** Adicionada a chamada `decryptData` ao `data.cpf` antes de retornar o objeto na função `findByPhone`.

### 1.2 Syntax Error no Schema da IA (`aiService.js`)
- **Problema:** O texto do prompt na função `aiService.js` utilizava template literals (\` \`) para definir a lista de variáveis mutuamente exclusivas (`showCalendar`, `showTimeSlots`, `requireCpf`, `requireDescription`). Porém, a formatação utilizou backticks sem escape dentro de uma string de backticks, gerando um `SyntaxError: Unexpected identifier 'showCalendar'` que impedia completamente a inicialização do módulo.
- **Risco:** Crítico (Queda total da aplicação, downtime 100%).
- **Correção:** Aplicado o escape adequado (`\`showCalendar\``) nas chaves do prompt do Gemini.

### 1.3 Condição de Corrida na Fila do Webhook (Processamento Duplo)
- **Problema:** A fila do webhook (Inbox Durável C7) usava o campo `created_at` em vez de um timestamp de início de processamento para determinar quando uma mensagem travou. Mensagens pendentes há mais de 5 minutos, recém-assumidas por um worker, eram imediatamente tratadas como "stale" (pois `created_at` era antigo) e reprocessadas por outro worker em paralelo.
- **Risco:** Médio (Processamento duplicado de webhooks em períodos de alta carga).
- **Correção:** Adicionado o campo `processing_at` à tabela `webhook_inbox` via `schema.sql` e implementado um **Atomic Claim** seguro através do RPC `claim_webhook_inbox`, que usa `FOR UPDATE SKIP LOCKED`. A função `fetchPending` do `databaseService.js` foi adaptada para usar este RPC.

## 2. Validação da Arquitetura (O que está FUNCIONANDO BEM)

### 2.1 Isolamento de Tenant (RLS Lógico vs Supabase RLS)
Realizado teste automatizado de RLS/Tenant (`test_rls.js`).
- O banco de dados no Supabase bloqueia requisições da chave `anon` por design (`service_role_only`). 
- A separação de Multi-Tenant é garantida na Camada de Negócio Node.js baseada no número de telefone do WhatsApp. 
- **Resultado do Teste:** SUCESSO. Testes rigorosos provaram que pacientes diferentes nunca têm seus históricos de chat cruzados (Isolamento de `sessions`) e a descriptografia do Blind Index não vaza dados (`patients`).

### 2.2 Controle de Concorrência e Overbooking
Realizado teste automatizado de Condição de Corrida (`test_race_condition.js`) bombardeando o sistema com dois webhooks simulados idênticos para "Confirmar agendamento" no mesmo milissegundo, para pacientes diferentes no mesmo horário (2026-12-20 às 09:00).
- **Resultado do Teste:** SUCESSO. A camada de banco de dados (Supabase) abortou graciosamente a transação secundária através do `UNIQUE INDEX appointments_active_slot_unique`.
- O controlador Node.js (`conversationController.js`) capturou a violação `23505` e respondeu adequadamente ao segundo paciente com: *"Esse horário acabou de ser preenchido por outro paciente."*, sem crashes e sem salvar a consulta. O design arquitetônico de concorrência aqui está impecável.

## 3. Próximos Passos Recomendados

A branch `qa/fix-12345` foi criada contendo os testes reprodutíveis (`test_race_condition.js`, `test_rls.js`, `check_db.js`) e os fixes descritos acima em `databaseService.js`, `schema.sql` e `aiService.js`.
1. Fazer commit e abrir Pull Request.
2. Atualizar o Supabase de Staging/Prod com o novo `schema.sql` (Adição do RPC e coluna `processing_at`).
3. Avaliar criar script de CI/CD para rodar `test_suite.js` a cada commit.

*Fim do Relatório.*
