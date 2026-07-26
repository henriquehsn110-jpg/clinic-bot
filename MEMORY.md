# 🧠 MEMORY.md — Aprendizados Cumulativos & Lições de Desenvolvimento

> **Diretriz:** Este arquivo é o repositório histórico de lições aprendidas, edge cases descobertos e armadilhas técnicas do ClinicaBot SaaS Pro.

---

## ⚠️ Armadilhas Técnicas & Soluções (Edge Cases Conhecidos)

### 1. Fuso Horário BRT em Servidores Cloud (`America/Sao_Paulo`)
- **Problema:** O método nativo `.toISOString()` converte datas para UTC. Em servidores cloud (Render/AWS) que usam UTC por padrão, agendamentos feitos após as 21:00 cravavam a data do dia seguinte.
- **Solução Padronizada:** Usar sempre `new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })` tanto em `dashboardController.js` quanto em `calendarService.js`.

### 2. Constraint Multi-Tenant no Supabase (`patients_phone_clinic_unique`)
- **Problema:** A tabela `patients` por padrão exigia `UNIQUE(phone)`. Isso impedia que duas clínicas diferentes cadastrassem um paciente com o mesmo número de telefone.
- **Solução:** Aplicou-se a constraint `UNIQUE (phone, clinic_id)`. Toda busca e inserção via `databaseService.patients.findOrCreate` utiliza `onConflict: 'phone,clinic_id'`.

### 3. Validação de Assinatura Webhook HMAC SHA-256 Meta
- **Problema:** Requisições de Webhook sem validação de assinatura permitiam que atacantes injetassem falsas mensagens de pacientes via HTTP POST.
- **Solução:** A função `verifySignature(req)` em `server.js` valida a header `X-Hub-Signature-256` utilizando `crypto.timingSafeEqual` contra o `APP_SECRET`. O express salva o buffer em `req.rawBody`.

### 4. Proteção contra Formula Injection no Exportador CSV
- **Problema:** Se um paciente cadastrasse o nome como `=SOMA(...)` ou `=CMD(...)`, a planilha da recepção executaria código ao abrir o CSV.
- **Solução:** A função `exportAppointmentsCSV` no `dashboard.html` prefixa qualquer caractere perigoso (`=`, `+`, `-`, `@`, `\t`, `\r`) com aspa simples `'`.

### 5. Omissão Silenciosa de Parâmetros Obrigatórios (ex: `clinicId` em `getAvailableSlots`)
- **Problema:** Métodos do serviço (`calendarService.getAvailableSlots`) exigem validação de tenant (`if (!clinicId) throw new Error(...)`). Quando `clinicId` foi omitido na geração da lista do calendário (`conversationController.js`), o método lançou exceção que foi capturada em silêncio pelo `.catch(() => [])`, resultando em 0 vagas exibidas ("Nenhuma vaga nos próximos dias").
- **Solução:** Propagar obrigatoriamente `clinicId` em todas as chamadas de serviço e evitar `.catch(() => [])` que mascarem erros de parâmetros de entrada.

---

## 📝 Decisões de Arquitetura Históricas (ADRs)

- **ADR-001:** Adotado Vanilla JS/HTML5/CSS3 para o Dashboard da recepção para garantir carregamento instantâneo sem overhead de compilação ou frameworks pesados.
- **ADR-002:** Uso do Gemini 2.0 Flash para a persona "Ana" devido à altíssima velocidade de resposta (<1.5s) e custo-benefício por token.
- **ADR-003:** Script de onboarding via CLI (`onboard_tenant.js`) em vez de painel self-service complexo, focado em vendas corporativas *White-Glove* de alto ticket.
- **ADR-004:** Adoção de ESLint no repositório (`.eslintrc.json`) com regras estritas de `no-undef` e `no-use-before-define` como bloqueio de segurança contra bugs de escopo antes do commit/deploy.

---

## 🛠️ Post-Mortems & Registro Histórico de Correções (Changelog de Bugs)

> Esta seção documenta a resolução técnica completa dos principais incidentes de produção para consulta futura de qualquer agente ou desenvolvedor.

### 📅 [26/07/2026] — Resolução do Ciclo de Boas-Vindas em Loop & Ocultação de Vagas na Agenda

#### 1. Sessões Órfãs (`clinic_id: null`) & Incompatibilidade Multi-Tenant
- **Sintoma:** O bot respondia com a mensagem de boas-vindas repetidamente, ignorando que o paciente já havia interagido no fluxo de agendamento.
- **Causa Raiz:** Sessões criadas antes da migração para o modelo Multi-Tenant possuíam o campo `clinic_id` como `null` ou não estavam vinculadas ao UUID correto da clínica atual. O método `db.sessions.get` filtrava por `.eq('phone', phone).eq('clinic_id', clinicId)`, retornando histórico vazio `[]` e forçando o reinício da conversa.
- **Resolução:** Atualização no banco de dados para vincular as sessões órfãs ao UUID da clínica principal e sanitização no fluxo de `sessions.set` / `sessions.get`.

#### 2. Crash Silencioso no Atalho "Agendar Consulta" (`ReferenceError: responseText`)
- **Sintoma:** Ao clicar no botão "Agendar Consulta" no WhatsApp, o bot não enviava a lista de procedimentos e voltava a mandar mensagem de boas-vindas na mensagem seguinte.
- **Causa Raiz:** Na linha 233 do `conversationController.js`, a chamada do `whatsappService.sendListMessage` utilizava a variável `responseText`, que era declarada apenas mais abaixo no arquivo (zona morta temporal). Isso gerava `ReferenceError: Cannot access 'responseText' before initialization`, derrubando a execução do webhook e impedindo o avanço de estado.
- **Resolução:** Substituição da variável incorreta por `procText` (que continha o texto do atalho declarado na linha 223).

#### 3. Auditoria Preventiva do ESLint (4 Erros Latentes de Escopo)
- **Sintoma:** Bugs latentes idênticos ao problema da `responseText` que crashariam o bot em fluxos de exceção ou agendamento familiar.
- **Causa Raiz:** Referências a variáveis deletadas ou renomeadas durante refatorações antigas.
- **Resolução:** 
  - Linha 282: substituído `errText` por `conflictText` (conflito de agendamento em slot ocupado).
  - Linha 496: substituído `isFamilyBooking` por `draft?.is_family_booking` (agendamento para terceiros/dependentes).
  - Linha 516: substituído `errText` por `failText` (falha técnica de comunicação com banco).
  - Linha 711: substituído `errText` por `responseText` (fallback de erro no envio da API do WhatsApp).

#### 4. Ocultação de Horários Disponíveis no Calendário ("Nenhuma vaga nos próximos dias")
- **Sintoma:** Após escolher uma especialidade (ex: "Consulta geral"), a lista de datas abria exibindo apenas a opção fallback "Outras datas... Nenhuma vaga nos próximos dias".
- **Causa Raiz:** Na linha 632 do `conversationController.js`, a consulta de disponibilidade em lote para os 14 dias candidatos chamava `calendarService.getAvailableSlots(d.formattedDate)` **sem o parâmetro obrigatório `clinicId`**. A função `getAvailableSlots` lançava erro imediato (`if (!clinicId) throw new Error(...)`), que era capturado em silêncio por `.catch(() => [])`. Com isso, todos os 14 dias retornavam array vazio de horários, acionando o fallback de agenda vazia.
- **Resolução:** Inserido o parâmetro `clinicId` na chamada: `candidateDates.map(d => calendarService.getAvailableSlots(d.formattedDate, clinicId).catch(() => []))`.

#### 5. Padronização de Nomenclatura no `dashboardController.js`
- **Sintoma:** Código ambíguo ao validar se o horário selecionado estava vago.
- **Causa Raiz:** A variável que recebia os horários **disponíveis** retornados por `calendarService.getAvailableSlots` chamava-se `occupied`.
- **Resolução:** Renomeada a variável para `availableSlots` nas linhas 283-287, refletindo a semântica correta do método.
