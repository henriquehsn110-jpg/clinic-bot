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
22. **Mapeamento de Secrets em Condicionais `if:` do GitHub Actions:** NUNCA acesse o contexto `secrets` diretamente dentro de condicionais de step `if:` em workflows do GitHub Actions (ex: `if: ${{ secrets.KEY != '' }}`). Mapeie as secrets para variáveis no nível do job (`env: HAS_KEY: ${{ secrets.KEY }}`) e avalie estritamente via `if: env.HAS_KEY != ''`.
23. **Heredoc Seguro para Injeção de Secrets em CI (`cat << 'EOF'`):** Ao gerar arquivos de ambiente (`.env` ou `.env.staging`) via shell heredoc em runners de CI, utilize SEMPRE delimitadores entre aspas simples (ex: `cat << 'EOF' > .env.staging`). Isso impede que o shell execute uma segunda passagem de parsing e corrompa caracteres especiais (`$`, crases, barras invertidas) presentes nos segredos renderizados pelo GitHub Actions.
24. **Resolução de Causa Raiz de Configuração vs Cópias Paliativas:** NUNCA introduza cópias redundantes de arquivos de ambiente (ex: `cp .env.staging .env`) para contornar scripts com caminhos fixos. Todos os scripts de teste e utilitários DEVEM respeitar o padrão `process.env.DOTENV_CONFIG_PATH || path.resolve(__dirname, '../.env')`.
25. **Determinismo de Dados em Testes com Constraints Únicas:** Testes automatizados que gravam pacientes e realizam validações de integridade no Supabase (como CPF e telefone) DEVEM utilizar geradores dinâmicos de dados válidos (ex: `generateValidCpf()`) e preparar o estado com `findOrCreate`, garantindo isolamento total entre execuções sucessivas sem depender de limpeza de registros concorrentes.
26. **Transparência de Mocks em Testes de Resiliência:** Mocks de falha de terceiros DEVEM interceptar estritamente o driver/cliente de transporte mais baixo (ex: `axios.post`, `chat.sendMessage`), nunca substituir a função de serviço de alto nível inteira. Isso garante que blocos try/catch, retentativas (withRetry), backoff exponencial e failover reais sejam de fato exercitados e medidos, não simulados por texto de log decorativo.
27. **Timeout de Aplicação em IA e Serviços Externos:** Toda chamada assíncrona a serviços de IA ou APIs externas sem timeout nativo seguro DEVE ser encapsulada em timeout de aplicação (`Promise.race` com `TIMEOUT_MS` configurável via variável de ambiente). O valor do timeout e o número de retentativas DEVEM ser calculados a partir da janela de tolerância do consumidor final (ex: limite de reentrega de webhook do canal usado), com margem de segurança documentada — nunca um valor fixo replicado entre projetos/integrações sem revalidar o contexto.
28. **Pacing Buffer em Rotinas de Disparo em Massa:** Toda rotina de disparo de mensagens em lote (lembretes automáticos, remarketing, notificações) DEVE conter buffer de espaçamento explícito entre envios sequenciais, calculado a partir do throughput real contratado com o provedor (ex: tier de MPS da Meta WhatsApp Cloud API) — não de um valor fixo copiado entre projetos. O cálculo (throughput contratado → intervalo mínimo seguro) deve ser documentado junto ao código que implementa o pacing.

29. **Confirmação Específica de Execução Manual de DDL:** Ao solicitar que o usuário execute um DDL manualmente no SQL Editor e aguardar confirmação antes de prosseguir, o agente NUNCA deve aceitar uma mensagem genérica de sucesso do editor (ex: 'Success. No rows returned') como prova suficiente de qual objeto foi criado — essa mensagem é idêntica para qualquer comando bem-sucedido, incluindo comandos de sessões anteriores não relacionados. O agente DEVE pedir que o usuário cole de volta uma query de confirmação específica que nomeie o objeto criado (ex: SELECT proname FROM pg_proc WHERE proname = 'nome_da_funcao', ou equivalente para índices/tabelas), e só prosseguir após ver esse nome específico no retorno do usuário.

## Skills (`.agents/skills/`)

- 🧪 `clinica-bot-qa` — 24 testes + stress 100 req
- 🔒 `lgpd-security-auditor` — CPF masking, AES-256
- 💬 `whatsapp-flow-simulator` — Fluxos Ana/WhatsApp
- 🗄️ `supabase-db-migrator` — Multi-Tenant RLS
- 🎨 `dashboard-ui-builder` — UI Vanilla CSS/JS
- 😈 `critico-rigido-advogado-diabo` — Anti-sycophancy, Red Teaming e crítica rigorosa
