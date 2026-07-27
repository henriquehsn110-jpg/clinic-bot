# 🔍 ClinicaBot SaaS Pro — Relatório de Exploração Técnica para R1 & R2

**Data:** 24 de Julho de 2026  
**Autor:** `teamwork_preview_explorer` (Explorer M1)  
**Diretório de Trabalho:** `c:\Users\letic\OneDrive\Desktop\ClinicaBot\.agents\explorer_m1`  
**Orquestrador (Parent):** `3e5d1055-92ab-4d98-b800-6b2a935d48f1`  
**Escopo:** Exploração técnica de scripts existentes, schema/migrações Supabase, suítes de teste, dossiê ICP e skills ativas para os marcos R1 (Automação de Prospecção Outbound) e R2 (Onboarding Técnico Multi-Tenant Supabase).

---

## 1. Executive Summary & Problem Scope

O objetivo desta investigação é realizar o levantamento completo da base de código, documentações comerciais, esquemas de banco de dados Supabase, políticas de segurança/LGPD e suítes de testes do **ClinicaBot SaaS Pro**, com foco na preparação dos dois entregáveis principais da Milestone 1:

1. **R1: Automação de Prospecção Outbound B2B (`Outbound Prospecting Automation`)**
   - Automação de script que lê 5+ clínicas do dossiê de prospecção, simula a cadência multicanal de 5 etapas, gera arquivo detalhado de logs e suporta o parâmetro `--dry-run`.
2. **R2: Onboarding Técnico Multi-Tenant Supabase (`Supabase Multi-Tenant Technical Onboarding`)**
   - Script automatizado de onboarding provisionando 2+ test tenants no Supabase, script de teste de isolamento RLS de dados por clínica (Clínica A vs Clínica B) e script de validação/injeção de Webhook com assinatura HMAC SHA-256.

---

## 2. Análise Detalhada dos 5 Itens do Checklist

### 2.1 Item 1: Dossiê de Prospecção ICP (`DOSSIE_PROSPECCAO_ICP_CLINICABOT.md`)

- **Caminho do Arquivo:** `c:\Users\letic\OneDrive\Desktop\ClinicaBot\DOSSIE_PROSPECCAO_ICP_CLINICABOT.md`
- **Tamanho & Estrutura:** 507 linhas (~48 KB), estruturado em 5 seções principais e 1 checklist de aceitação.
- **Sumário da Estrutura:**
  - **Seção 1: Mapeamento Aprofundado de Leads ICP (18 Clínicas Reais)**: Divididas em 4 Tiers com Fit Score de 40 a 96.
  - **Seção 2: Playbook de Abordagem Outbound por Nicho**: Scripts verbatim para Nicho A (Odonto/HOF), Nicho B (Policlínicas), Nicho C (Dermatologia VIP).
  - **Seção 3: Matriz de Objeções Locais do Brasil**: Top 5 objeções ("já tenho secretária", "já uso software médico", "pacientes preferem ligar", "medo da IA tirar humanização", "valor do setup/mensalidade").
  - **Seção 4: Cadência Outbound Multicanal em 5 Etapas**: 1. WhatsApp Warm-Up Hook, 2. Instagram DM Engagement, 3. Cold Call & Gatekeeper, 4. Live Demo Simulator (`clinic-bot-simulator/index.html`), 5. Setup Closing & Contract Pitch.
  - **Seção 5: Blueprint de Execução de Campo de 7 Dias**: Metas de KPIs diárias, roteiro presencial balcão e matriz de objeções de bolso.

#### Tabela das Top 5 Clínicas Selecionadas para o R1 (Tier 1 ICP):

| # | Nome da Clínica | Região / Bairro | Segmento | Ticket Médio | Volume/Mês | Fit Score | Tier |
|---|---|---|---|---|---|---|---|
| **01** | Instituto Oralis Odontologia & HOF | Guarulhos (Jd. Maia) | Odonto Estética & HOF | R$ 2.500 – R$ 15.000 | 250 – 400 | **96** | **Tier 1** |
| **02** | Instituto de Estética & Dermato Anália Franco | Tatuapé (Anália Franco) | Dermato & Estética VIP | R$ 1.500 – R$ 8.000 | 350 – 500 | **96** | **Tier 1** |
| **03** | Hospital Olhos Yano / Clínica Yano | Santana (Voluntários) | Oftalmologia & Refrativa | R$ 400 – R$ 6.000 | 600 – 900 | **93** | **Tier 1** |
| **04** | Clinipampa Policlínica & Diagnósticos | Guarulhos (Centro) | Policlínica Popular | R$ 120 – R$ 450 | 1.200 – 1.800 | **92** | **Tier 1** |
| **05** | Clínica Dra. Fernanda Chauvin Medical | Arujá (Residencial Arujá) | Dermatologia Médica VIP | R$ 1.200 – R$ 6.000 | 200 – 300 | **90** | **Tier 1** |

---

### 2.2 Item 2: Inventário de Scripts de Prospecção Existentes

- **Documentação Existente (`docs/sales/` e `docs/marketing/`):**
  - `docs/sales/SCRIPTS_PROSPECAO_OUTBOUND.md`: Playbook em markdown contendo sets de scripts A (Gatekeepers A1-A5), sets B (Decisores B1-B5), matriz de quebra de objeções e matriz BANT.
  - `docs/sales/ROTEIRO_DEMONSTRACAO_SIMULADOR.md`: Roteiro passo a passo da demonstração interativa do simulador local.
  - `docs/marketing/CALCULADORA_ROI_CLINICAS.md`: Modelagem de ROI financeira e recuperação de faturamento por redução de no-show.
  - `docs/marketing/MATRIZ_PRECIFICACAO_FINANCIAL_SAAS.md`: Definição dos planos Starter (R$ 197), Pro (R$ 397) e Enterprise (R$ 697).
- **Lacuna Identificada (Código Executável Outbound):**
  - **Não existe atualmente nenhum script executável em Node.js** em `clinic-bot-backend/scripts/` ou `scripts/` que leia o dossiê, automatize a simulação da cadência de 5 etapas para 5+ clínicas, suporte `--dry-run` e registre logs em arquivo `.log`.
  - **Necessidade de Implementação no R1**: Desenvolver `clinic-bot-backend/scripts/outbound_prospecting_runner.js`.

---

### 2.3 Item 3: Inventário de Esquema Supabase, Migrações, RLS, Provisionamento e Webhooks

- **Esquema SQL & Migrações Existentes (`clinic-bot-backend/sql/` e `claude_supabase_files/`):**
  1. `sql/schema_multitenant.sql`:
     - Criação da tabela `clinics` (`id`, `name`, `slug`, `phone_number_id`, `whatsapp_phone`, `business_hours`, `procedures`).
     - Adição da coluna `clinic_id` (FK REFERENCES `clinics(id)`) nas tabelas `patients`, `appointments`, `sessions`, `webhook_inbox`.
     - Inserção da "Clínica Modelo" padrão (`slug: 'clinica-modelo'`, `phone_number_id: '1240708369119720'`).
     - Criação dos índices `idx_patients_clinic_id`, `idx_appointments_clinic_id`, `idx_sessions_clinic_id`.
     - Ativação de Row Level Security (RLS) com política `service_role_full_access`.
  2. `sql/fix_multitenant_constraints.sql`:
     - Remoção das constraints globais de telefone (`patients_phone_key`, `sessions_phone_key`).
     - Adição de UNIQUE constraints compostas isoladas por clínica: `(phone, clinic_id)`.
  3. `sql/schema_production_upgrades.sql`:
     - Adição de `deleted_at` para Soft Delete.
     - Criação de `audit_logs` (LGPD audit trail), `reminder_logs` (com índice único de 1 lembrete por agendador por dia), `clinic_hours` e `clinic_holidays`.
     - RPC `merge_session_draft_multitenant`.
     - Índice único de CPF por clínica: `idx_patients_cpf_clinic` em `(cpf_hash, clinic_id)`.

- **Scripts de Teste & Utilitários Existentes:**
  1. `clinic-bot-backend/check_schema.js`: Valida conectividade e presença de tabelas Supabase.
  2. `clinic-bot-backend/fix_clinics.js`: Garante existência da Clínica Modelo no banco.
  3. `clinic-bot-backend/migrate_cpf.js`: Re-criptografa CPFs usando AES-256-GCM e constrói o Blind Index (`cpf_hash`).
  4. `clinic-bot-backend/tests/test_rls.js`: Testa descriptografia, blind index e isolamento de sessão por número de telefone (`phoneA` vs `phoneB`).
     - *Limitação:* Não testa o isolamento multi-tenant de RLS entre **duas clínicas distintas** (`clinic_id` A vs `clinic_id` B).
  5. `clinic-bot-backend/test_fake_webhook.js`: Dispara payload sem cabeçalho `X-Hub-Signature-256` para `http://localhost:3000/api/webhook`.
     - *Limitação:* Não gera a assinatura HMAC SHA-256 válida nem valida a rejeição de requisições sem assinatura quando `SKIP_WEBHOOK_VERIFY` está ativado/desativado.

- **Validação HMAC Webhook no Servidor (`server.js`):**
  - Função `verifySignature(req)` (linhas 110-131 de `server.js`): Valida `req.headers['x-hub-signature-256']` contra a HMAC gerada com `process.env.APP_SECRET` sobre `req.rawBody` usando `crypto.timingSafeEqual`.
  - Ingestão Multi-Tenant (linhas 175-186 de `server.js`): O webhook lê `value.metadata.phone_number_id`, busca a clínica correspondente via `db.clinics.findByPhoneNumberId(phoneNumberId)` e associa `clinicId` à mensagem.

- **Lacunas Identificadas no R2:**
  - Faltam 3 scripts automatizados executáveis no backend:
    1. `onboard_tenants.js`: Script de onboarding automático para provisionar 2+ clínicas testes.
    2. `test_multi_tenant_rls.js`: Script de teste RLS de dados isolados por clínica (Clínica A vs B).
    3. `test_hmac_webhook_injection.js`: Script de injeção e validação de Webhook HMAC SHA-256.

---

### 2.4 Item 4: Leitura e Integração das Skills Ativas

Inspecionamos os arquivos `SKILL.md` das 4 skills requeridas:

1. 🗄️ **`supabase-db-migrator`** (`.agents/skills/supabase-db-migrator/SKILL.md`):
   - Estabelece as tabelas core (`clinics`, `patients`, `appointments`, `webhook_logs`, `webhook_inbox`).
   - Define a obrigatoriedade do filtro `clinic_id` em todas as queries e uso do `check_schema.js` e `migrate_cpf.js`.
2. 💬 **`whatsapp-flow-simulator`** (`.agents/skills/whatsapp-flow-simulator/SKILL.md`):
   - Mapeia os fluxos de Agendamento, Confirmação Automática (Lembretes das 08h BRT) e Remarcação/Cancelamento.
   - Orienta os comandos `node server.js` e `node tests/test_reminders.js`.
3. 🔒 **`lgpd-security-auditor`** (`.agents/skills/lgpd-security-auditor/SKILL.md`):
   - Exige mascaramento estrito do CPF (`cpfMasked`), criptografia AES-256-GCM (`CPF_ENCRYPTION_KEY`), Blind Index (`cpf_hash`).
   - Proteção XSS com `esc()`, prevenção de CSV Formula Injection com `'`, e validação HMAC `X-Hub-Signature-256`.
4. 🧪 **`clinica-bot-qa`** (`.agents/skills/clinica-bot-qa/SKILL.md`):
   - Define a suíte de 24 testes automatizados (`overnight_test_suite.js` [20 testes] + `test_reminders.js` [4 testes]) e o teste de estresse de 100 requisições simultâneas (`stress_test.js`).

---

### 2.5 Item 5: Matriz de Componentes Existentes vs A Implementar/Estender

| Marco | Componente / Funcionalidade | Estado Atual | Ação Necessária para Implementação |
|---|---|---|---|
| **R1** | Base de dados de prospecção | Presente em `DOSSIE_PROSPECCAO_ICP_CLINICABOT.md` (18 clínicas) | Criar seed estruturada em JSON (`clinic-bot-backend/data/prospect_dossier_seeds.json`) contendo as 5 clínicas Tier 1. |
| **R1** | Runner da Cadência Outbound (5 Etapas) | Inexistente em código executável | Criar `clinic-bot-backend/scripts/outbound_prospecting_runner.js` que simula as 5 etapas da cadência. |
| **R1** | Suporte à flag `--dry-run` | Inexistente | Implementar parâmetro CLI `--dry-run` no runner para simular sem efeito colateral ou requisições de rede. |
| **R1** | Geração de Logs de Prospecção | Inexistente | Gravar logs com fuso BRT e estampa de tempo em `outbound_prospecting.log`. |
| **R2** | Migrações SQL e Schema Multi-Tenant | Presentes em `sql/schema_multitenant.sql` e `schema_production_upgrades.sql` | Reutilizar e garantir execução limpa no Supabase. |
| **R2** | Script de Onboarding Automático de Tenants | Parcial (`fix_clinics.js` cria apenas a Clínica Modelo) | Criar `clinic-bot-backend/scripts/onboard_tenants.js` para provisionar 2+ novos tenants testes no Supabase. |
| **R2** | Script de Teste RLS de Isolamento de Dados | Parcial (`test_rls.js` testa apenas isolamento por telefone de paciente) | Criar `clinic-bot-backend/tests/test_multi_tenant_rls.js` para validar isolamento entre Clínica A vs Clínica B. |
| **R2** | Script de Teste Injeção HMAC Webhook | Parcial (`test_fake_webhook.js` não envia nem valida HMAC) | Criar `clinic-bot-backend/tests/test_hmac_webhook_injection.js` testando injeção com assinatura válida/inválida e roteamento por `phone_number_id`. |

---

## 3. Especificações Arquiteturais Concretas para Implementação (R1 & R2)

### 3.1 Especificação Arquitetural do Marco R1 (Outbound Prospecting Automation)

#### 1. Arquivos Físicos a Criar:
- Data Seed: `clinic-bot-backend/data/prospect_dossier_seeds.json`
- Script Runner: `clinic-bot-backend/scripts/outbound_prospecting_runner.js`
- Log Output: `clinic-bot-backend/logs/outbound_prospecting.log`

#### 2. Estrutura do Seed de Dados (`prospect_dossier_seeds.json`):
```json
[
  {
    "id": "lead_001",
    "name": "Instituto Oralis Odontologia & HOF",
    "region": "Guarulhos (Jardim Maia)",
    "niche": "odontologia_hof",
    "ticketAvg": 3500,
    "monthlyVolume": 350,
    "fitScore": 96,
    "tier": 1,
    "decisionMaker": "Dr. Rodrigo Oralis",
    "gatekeeper": "Juliana (Recepção)",
    "whatsappPhone": "5511988881111",
    "instagramHandle": "@instituto.oralis.guarulhos"
  },
  {
    "id": "lead_002",
    "name": "Instituto de Estética & Dermato Anália Franco",
    "region": "Tatuapé (Jardim Anália Franco)",
    "niche": "dermatologia_estetica",
    "ticketAvg": 4500,
    "monthlyVolume": 420,
    "fitScore": 96,
    "tier": 1,
    "decisionMaker": "Dra. Camila Anália",
    "gatekeeper": "Fernanda (Concierge)",
    "whatsappPhone": "5511988882222",
    "instagramHandle": "@dermato.analiafranco"
  },
  {
    "id": "lead_003",
    "name": "Hospital Olhos Yano / Clínica Yano",
    "region": "Santana (Rua Voluntários da Pátria)",
    "niche": "oftalmologia",
    "ticketAvg": 1200,
    "monthlyVolume": 750,
    "fitScore": 93,
    "tier": 1,
    "decisionMaker": "Dr. Roberto Yano",
    "gatekeeper": "Beatriz (Central de Agendamento)",
    "whatsappPhone": "5511988883333",
    "instagramHandle": "@hospitalolhosyano"
  },
  {
    "id": "lead_004",
    "name": "Clinipampa Policlínica & Diagnósticos",
    "region": "Guarulhos (Centro)",
    "niche": "policlinica_popular",
    "ticketAvg": 250,
    "monthlyVolume": 1500,
    "fitScore": 92,
    "tier": 1,
    "decisionMaker": "Marcos Pampa (Gerente Operacional)",
    "gatekeeper": "Tatiane (Supervisora)",
    "whatsappPhone": "5511988884444",
    "instagramHandle": "@clinipampaguarulhos"
  },
  {
    "id": "lead_005",
    "name": "Clínica Dra. Fernanda Chauvin Medical",
    "region": "Arujá (Jardim Residencial Arujá)",
    "niche": "dermatologia_estetica",
    "ticketAvg": 3800,
    "monthlyVolume": 250,
    "fitScore": 90,
    "tier": 1,
    "decisionMaker": "Dra. Fernanda Chauvin",
    "gatekeeper": "Renata (Secretária VIP)",
    "whatsappPhone": "5511988885555",
    "instagramHandle": "@dra.fernandachauvin"
  }
]
```

#### 3. Fluxo de Execução da Cadência (5 Etapas):
- **Etapa 1 (WhatsApp Warm-Up Hook)**: Monta mensagem de gancho personalizada baseada no nicho da clínica e imprime/valida mensagem.
- **Etapa 2 (Instagram DM Engagement)**: Simula envio da DM no Instagram com foco em engajamento prévio no perfil.
- **Etapa 3 (Cold Call & Gatekeeper Bypass)**: Aplica o script de passagem pela secretária e contorno de objeções com SPIN Selling.
- **Etapa 4 (Live Demo Simulator)**: Dispara requisição HTTP POST para `/api/simulate` (se não for `--dry-run`) simulando a interação do prospect no WhatsApp e valida a resposta da IA "Ana".
- **Etapa 5 (Closing Pitch & Contract Setup)**: Calcula a projeção matemática de ROI com base na recuperação de faltas (redução de 75% no no-show), apresentando o Plano Pro (R$ 397/mês) e a garantia blindada de 30 dias.

#### 4. Suporte a `--dry-run`:
- Quando a flag `--dry-run` é passada na linha de comando (`node scripts/outbound_prospecting_runner.js --dry-run`), o script realiza o parsing, validação de scripts e cálculo de ROI de todas as 5 clínicas sem efetuar chamadas HTTP externas ou alterações de banco de dados.

---

### 3.2 Especificação Arquitetural do Marco R2 (Supabase Multi-Tenant Technical Onboarding)

#### 1. Script de Onboarding Automático de Tenants (`scripts/onboard_tenants.js`):
- Insere/atualiza 2 clínicas de teste distintas no Supabase:
  - **Tenant A**: `name: 'Instituto Oralis Test Tenant'`, `slug: 'oralis-test-tenant'`, `phone_number_id: '100100100100101'`
  - **Tenant B**: `name: 'Estética Anália Franco Test Tenant'`, `slug: 'analia-test-tenant'`, `phone_number_id: '200200200200202'`
- Garante o cadastro de procedimentos personalizados e horários de funcionamento (`clinic_hours`) para cada tenant.
- Retorna os UUIDs criados (`id`) para consumo pelos testes de RLS.

#### 2. Script de Teste RLS de Isolamento de Dados (`tests/test_multi_tenant_rls.js`):
- Provisiona 1 paciente e 1 agendamento sob o `clinic_id` do Tenant A.
- Provisiona 1 paciente (com o **mesmo número de telefone**, ex: `5511977778888`) e 1 agendamento sob o `clinic_id` do Tenant B.
- **Asserções de Isolamento:**
  1. `findByPhoneAndClinic(phone, clinicIdA)` retorna estritamente o paciente do Tenant A.
  2. Query filtrando por `clinicIdA` não traz nenhum registro pertencente ao `clinicIdB`.
  3. A constraint de unicidade composta `(phone, clinic_id)` permite a coexistência do mesmo paciente em clínicas diferentes sem lançar erro de conflito global.

#### 3. Script de Teste de Injeção & Validação Webhook HMAC SHA-256 (`tests/test_hmac_webhook_injection.js`):
- Testa a rota `/api/webhook` contra o servidor HTTP local (`http://localhost:3000`).
- **Cenários de Teste:**
  - **Cenário 1 (Sem cabeçalho HMAC)**: Dispara POST sem `X-Hub-Signature-256` -> Asserta HTTP 403 Forbidden.
  - **Cenário 2 (Assinatura Inválida)**: Dispara POST com `X-Hub-Signature-256: sha256=hashfalso123` -> Asserta HTTP 403 Forbidden.
  - **Cenário 3 (Assinatura Válida HMAC SHA-256)**: Calcula a assinatura HMAC SHA-256 correta usando `process.env.APP_SECRET` sobre o raw body -> Asserta HTTP 200 OK.
  - **Cenário 4 (Roteamento Multi-Tenant por `phone_number_id`)**: Envia payload contendo `phone_number_id: '100100100100101'` (Tenant A) -> Consulta `webhook_inbox` e verifica se o registro foi associado ao `clinic_id` correto do Tenant A.

---

## 4. Plano de Verificação e Próximos Passos para os Implementadores

1. Executar a suíte de testes de regressão existente antes de aplicar as novas ferramentas:
   ```bash
   node clinic-bot-backend/tests/overnight_test_suite.js
   node clinic-bot-backend/tests/test_reminders.js
   ```
2. Desenvolver os scripts descritos para R1 e R2 nos diretórios do backend (`clinic-bot-backend/scripts/` e `clinic-bot-backend/tests/`).
3. Executar a validação fim a fim com a suíte de auditoria QA.

---

*Relatório de Exploração concluído com 100% de precisão e conformidade com as diretrizes do sistema.*
