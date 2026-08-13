# AGENTS.md — ClinicaBot SaaS Pro

> **SISTEMA DE MEMÓRIA:** Todo agente DEVE ler obrigatoriamente `PROJECT_KNOWLEDGE_BASE.md`, `STATE.md` e `MEMORY.md` ANTES de qualquer sugestão ou resposta.

## 🛡️ Protocolo de Leitura Antes de Perguntar (Read-Before-Ask)

1. **NUNCA peça ao usuário para fazer ou confirmar algo que já está concluído.**
2. Antes de qualquer resposta, consulte `STATE.md` (Fila de Tarefas Concluídas) e o código-fonte para validar se a etapa já existe.
3. Ao concluir uma nova tarefa, atualize o `STATE.md` imediatamente marcando a tarefa como `[x]`.

## Core Rules

1. **Fuso BRT:** Use `new Date().toLocaleString("en-US",{timeZone:"America/Sao_Paulo"})`. Nunca `.toISOString().split('T')[0]`.
2. **Datas DD/MM/YYYY:** Toda data ao paciente em `DD/MM/YYYY`. Nunca ISO.
3. **Persona "Ana":** Apresentar-se como Ana + emoji 😊 na 1ª mensagem.
4. **Dashboard → WhatsApp:** Confirmar/Cancelar dispara notificação automática ao paciente.
5. **XSS:** `esc()` em interpolações HTML. `data-*` + Event Delegation. `rel="noopener noreferrer"`.
6. **LGPD:** Nunca `cpf` bruto em API. Só `cpfMasked`. CPF de outro telefone → Handoff Humano.
7. **Webhook HMAC:** `verifySignature(req)` obrigatório em `/webhook` e `/api/webhook`.
8. **CSV:** Sanitizar `= + - @ \t \r` com `'`.
9. **Testes:** Rodar `node tests/overnight_test_suite.js`, `node tests/test_tenant_rls_isolation.js` e `node tests/test_hmac_webhook_injection.js`.
10. **Roteamento Estático:** Mapear explicitamente rotas `app.get()` (`/` vs `/dashboard`) no `server.js` para que `/dashboard/` não carregue o `index.html` da Landing Page por padrão de `express.static`.
11. **Verificação com Evidência (Anti Auto-Avaliação):** Toda alegação de bug corrigido ou teste aprovado DEVE vir acompanhada de: (a) diff real do código alterado, (b) saída bruta de terminal/execução HTTP não truncada. Tabelas verdes de "X/X PASS" sem evidência bruta são opinião, não validação. Nunca declarar "100% auditado" sem que um revisor externo ou teste independente confirme com output real.
12. **Layout da Tabela & Botões do Dashboard:** NUNCA aplicar trava fixa (`width: 32px`) em botões `<button>` de tabela contendo texto (`✓ Confirmar`, `✓ Cancelar`). Manter `width: auto`, `white-space: nowrap` e alinhamento flex com `gap: 6px`. Definir larguras mínimas explícitas para as colunas (`Procedimento` min-width: 170px, `Ações` min-width: 180px) para evitar truncamento de tratamentos.
13. **Smartphone Mockup do WhatsApp:** No painel de configurações (`#tab-settings`), a pré-visualização da IA DEVE obrigatoriamente utilizar o container visual de celular `.phone-mockup` (com notch, barra oficial do WhatsApp `#1f2c34`, avatar 👩‍⚕️, indicador online e balões reativos com timestamps). NUNCA remover a moldura ou substituir por texto corrido.
14. **Integridade de Abas do Dashboard:** Toda aba do menu lateral (`.tab-btn`) DEVE obrigatoriamente possuir o container `<div id="tab-X" class="section-card">` correspondente no HTML e estar mapeada na função `switchTab()` (ex: `#tab-crm` para CRM & Remarketing), impedindo que qualquer aba renderize a tela em branco.
15. **Rotas Administrativas Isoladas (/admin/):** As rotas sob `/admin/` utilizam secret JWT dedicado (`ADMIN_JWT_SECRET`), exigem 2FA TOTP com `speakeasy`, possuem rate limit agressivo (15 req/min) e registram obrigatoriamente toda ação de `/restart` e `/rollback` na tabela `admin_audit_log` no Supabase. NUNCA reaproveitar secrets de tenant ou liberar acesso aos JWTs de clientes normais.
16. **Execução NPM no Shell Windows:** Ao rodar scripts npm em ambientes Windows PowerShell com restrição de política de execução (`UnauthorizedAccess` em `npm.ps1`), execute via `cmd.exe /c "npm ..."` para garantir execução limpa sem falhas de permissão.
17. **Fluxo de Dependente (FAMILY_BOOKING):** É estritamente obrigatório solicitar e validar o CPF do dependente logo após a coleta do NOME. O CPF do titular cadastrado no banco NÃO satisfaz essa etapa. A FSM JAMAIS deve transicionar direto de NOME -> CONFIRMAÇÃO.
18. **Reset de Estado na Máquina de Estados (FSM):** Ao interceptar intenções globais (como 'Cancelar', 'Remarcar' ou iniciar um novo 'Agendar') no meio de um fluxo em andamento, todas as variáveis e flags do `draft` da sessão (especialmente `is_family_booking`, `dependentName` e `dependentCpf`) DEVEM ser explicitamente resetadas para seu valor inicial (`false` ou nulo). Falhar nisso gera estado "órfão" e permite o vazamento de permissões (bypass) para o próximo fluxo.
19. **GitHub Actions Cache Path:** Ao configurar o `cache-dependency-path` na action `setup-node`, utilize sempre wildcards (ex: `**/package-lock.json`) ou caminhos relativos à raiz do repositório. Nunca utilize caminhos com `./` combinados com a diretiva `working-directory`, pois isso quebra a resolução do cache.
20. **Verificação Estrita de Funcionalidades Existentes:** ANTES de sugerir novos desenvolvimentos ou próximos passos ao usuário, o agente DEVE consultar a seção `Concluídas & Validadas` do `STATE.md` e o código-fonte para evitar propor recursos que já existem e estão homologados no projeto.
21. **Segredos em Workflows do GitHub Actions:** NUNCA insira strings de fallback em texto puro para chaves de API, JWTs ou tokens de serviço dentro de arquivos `.github/workflows/*.yml` (ex: `${{ secrets.KEY || 'string_bruta' }}`). Utilize estritamente a sintaxe `${{ secrets.SECRET_NAME }}` sem fallbacks no código para evitar o bloqueio de segurança `GH013` (Secret Scanning Push Protection).

## Skills (`.agents/skills/`)

- 🧪 `clinica-bot-qa` — 24 testes + stress 100 req
- 🔒 `lgpd-security-auditor` — CPF masking, AES-256
- 💬 `whatsapp-flow-simulator` — Fluxos Ana/WhatsApp
- 🗄️ `supabase-db-migrator` — Multi-Tenant RLS
- 🎨 `dashboard-ui-builder` — UI Vanilla CSS/JS
- 😈 `critico-rigido-advogado-diabo` — Anti-sycophancy, Red Teaming e crítica rigorosa
