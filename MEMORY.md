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

#### 6. Trava Determinística de Estado para Exibição do Calendário (`showCalendar`)
- **Sintoma:** Em variações da resposta da LLM, o campo `showCalendar` vinha como `false` ao selecionar uma especialidade (ex: "Consulta geral") ou clicar em "Outras datas...", fazendo o bot responder apenas em texto em vez de enviar o menu de datas do WhatsApp.
- **Causa Raiz:** Dependência exclusiva da saída probabilística da LLM para acionar componentes visuais da Meta WhatsApp API.
- **Resolução:** Inserida trava determinística no `conversationController.js`: ao identificar a escolha de um procedimento ou o clique em "Outras datas...", o estado `aiResponse.showCalendar` é forçado para `true` garantindo o envio do menu interativo de datas.

#### 7. Rascunho Vazio no `setDraft` (`SCHEDULING_CONFIRMATION_FAILED: {}`)
- **Sintoma:** O paciente selecionava especialidade, data e horário, mas ao clicar em "Confirmar", o bot falhava com `SCHEDULING_CONFIRMATION_FAILED: {}`.
- **Causa Raiz:** Nas linhas 373, 380, 399, 416 e 432 do `conversationController.js`, a função `db.sessions.setDraft(phone, {}, clinicId)` era chamada com `{}` em vez do objeto `draft`. Isso impedia a gravação das escolhas do paciente no banco de dados.
- **Resolução:** Substituídas todas as 5 ocorrências para `db.sessions.setDraft(phone, draft, clinicId)`, gravando os dados com 100% de sucesso.

#### 8. Conflito por Registro Órfão com `clinic_id: null` (`SCHEDULING_CONFLICT`)
- **Sintoma:** Ao tentar agendar para `2026-07-27 08:00`, a gravação no Supabase retornava erro `23505` (`appointments_active_slot_unique`), enquanto a busca de vagas continuava exibindo `08:00` como disponível.
- **Causa Raiz:** Existia um agendamento antigo na tabela `appointments` com `clinic_id: null` para `2026-07-27 08:00:00`. A função `getOccupiedSlots` filtrava por `clinic_id = 'uuid'`, ignorando a linha órfã, enquanto a constraint única do PostgreSQL bloqueava qualquer novo insert para a mesma data/horário.
- **Resolução:** Sanitizadas todas as linhas órfãs nas tabelas `patients` e `appointments` atribuindo o `clinic_id` correto (fazendo `08:00` ser devidamente filtrado das vagas disponíveis) e ajustado o manipulador de conflito para resetar o rascunho e abrir o menu de datas do WhatsApp se houver conflito.

#### 9. Re-exibição dos Botões de Confirmação na Mensagem de Sucesso
- **Sintoma:** Após o agendamento ser gravado com sucesso, a mensagem final de confirmação voltava a exibir os botões `["Confirmar", "Agendar p/ Outro", "Alterar"]`. Ao clicar em "Confirmar" novamente, o bot pedia para recomeçar o processo.
- **Causa Raiz:** O método `setDraft(phone, null, clinicId)` limpava o rascunho no Supabase, mas o objeto `draft` na memória local da requisição ainda continha os valores antigos. A máquina de estados no final da função avaliava o rascunho como completo e anexava os 3 botões de confirmação.
- **Resolução:** Adicionada a limpeza das propriedades do objeto `draft` em memória (`draft.type = null; draft.date = null; draft.time = null...`) imediatamente após `calendarService.scheduleAppointment`, garantindo que a mensagem de sucesso não exiba botões de confirmação redundantes.

#### 10. Fallthrough Sem Retorno no `isConfirming` Gerando Mensagem Falsa de CPF Inválido
- **Sintoma:** Ao clicar em "Confirmar", a consulta era criada com 100% de sucesso no banco Supabase, mas o texto da resposta enviada ao WhatsApp do paciente trazia a mensagem `"O CPF informado é inválido. Por favor, informe seu CPF de 11 dígitos para prosseguirmos."`.
- **Causa Raiz:** No `conversationController.js`, o bloco `if (isConfirming)` efetuava o agendamento no Supabase e limpava o rascunho, porém não possuía um `return` explícito ao final da criação. A execução continuava e caía nas verificações seguintes de extração de CPF. Como a palavra `"Confirmar"` não é um CPF de 11 dígitos, a resposta era sobrescrita com o erro de CPF.
- **Resolução:** Inserido o `return` explícito com o payload completo e estruturado da mensagem de confirmação de agendamento ao finalizar a gravação no `isConfirming`.

#### 11. Data Trocada no WhatsApp Real (`03/08/2026` → `08/03/2027`)
- **Sintoma:** Ao selecionar `03/08/2026` (3 de agosto) na lista de datas do WhatsApp, o bot exibia `08/03/2027` (8 de março de 2027) — dia e mês invertidos e ano avançado.
- **Causa Raiz:** A função `normalizeInputDate()` no `conversationController.js` não reconhecia o formato ISO `YYYY-MM-DD` que chega do WhatsApp List (`Selecionei a data: 2026-08-03`). O regex `dmRegex` (`/\b(\d{1,2})[\/\-](\d{1,2})\b/`) casava com `08-03` de dentro de `2026-08-03`, interpretando `08` como dia e `03` como mês (março). Como março (3) < julho (7, mês atual), incrementava o ano para 2027. Resultado: `2027-03-08` formatado como `08/03/2027`.
- **Resolução:** (1) Adicionado reconhecimento explícito de `YYYY-MM-DD` / `Selecionei a data: YYYY-MM-DD` no início da função com short-circuit. (2) O regex `dmRegex` agora usa apenas barra `/` como separador (não mais `-`) e lookbehind `(?<!\d)` para não casar dentro de datas ISO. (3) 7/7 cenários de teste validados.

#### 12. Botão [Confirmar] Aparecendo Antes de Coletar o Nome do Paciente
- **Sintoma:** Após um paciente novo informar o CPF, a IA Gemini perguntava corretamente "Qual é o seu nome completo?", mas os botões `[Confirmar] [Agendar p/ Outro] [Alterar]` já apareciam — permitindo confirmar sem nome.
- **Causa Raiz:** A máquina de estados determinística (linha 619 do `conversationController.js`) verificava apenas `draft.type && draft.date && draft.time && CPF` para exibir os botões de confirmação (Passo 5), sem verificar se o nome do paciente já havia sido coletado. Pacientes novos com CPF não localizado no banco não possuíam nome, mas a condição era satisfeita prematuramente.
- **Resolução:** Adicionada verificação `hasPatientName` na condição do Passo 5: `const hasPatientName = !!(draft.name || (patient && patient.name && patient.name !== phone))`. Os botões de confirmação só aparecem quando o nome é válido.

#### 13. Sanitização e Persistência Imediata do Nome do Paciente (Caso Mariana)
- **Sintoma:** Ao responder à pergunta "Qual é o seu nome completo?" com frases como "Meu nome é Mariana", o bot ou gravava a frase inteira "Meu nome é Mariana" como nome, ou não sincronizava a tabela `patients` do Supabase antes de chamar a IA Gemini, fazendo com que a mensagem de confirmação não soubesse o nome digitado ou usasse nomes antigos. Se a pessoa respondesse com saudação ("Boa noite"), caía em fallback indevido.
- **Causa Raiz:** (1) Falta de função de sanitização de prefixos portugueses ("meu nome é", "sou a", "me chamo"). (2) O nome `draft.name` não era propagado no `draftInfoTag` enviado ao Gemini. (3) A tabela de pacientes no banco Supabase só era atualizada no clique final em Confirmar, deixando a busca por paciente com nome nulo/telefone. (4) Respostas como "Boa noite" quando o nome foi solicitado não possuíam interceptador determinístico de re-solicitação de nome.
- **Resolução:** (1) Criada a função `extractCleanName(text)` que remove prefixos, ignora palavras da aplicação e capitaliza corretamente ("Mariana Silva"). (2) Atualização imediata via `db.patients.updateName(phone, extractedName, clinicId)`. (3) Inclusão de `Paciente: ${currentPatientName}` na `draftInfoTag` para o Gemini. (4) Interceptador determinístico que rejeita saudações e re-solicita o nome se necessário. (5) Suíte unitária `tests/test_name_extraction.js` com 9/9 PASS.
