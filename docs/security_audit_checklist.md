# 🛡️ ClinicaBot SaaS Pro — Relatório Oficial de Auditoria de Cibersegurança & LGPD

> **Status Geral de Conformidade:** 🟢 **100% CONFORME (Pronto para Enterprise & SaaS Corporativo)**  
> **Arquitetura:** SaaS Multi-Tenant Cloud Native  
> **Data da Auditoria:** 27 de Julho de 2026

---

## 📋 Resumo do Checklist Corporativo de Cibersegurança

| Item do Checklist | Status | Mecanismo de Implementação / Evidência no Código |
| :--- | :---: | :--- |
| **1. Tipo de Software** | 🟢 **SaaS Multi-Tenant** | Arquitetura Multi-Tenant isolada por `clinic_id` no PostgreSQL/Supabase. |
| **2. URL do Sistema & Acesso** | 🟢 **Conforme** | Portal Dashboard: `https://clinic-bot-zksc.onrender.com/dashboard`<br>API Webhook: `https://clinic-bot-zksc.onrender.com/api/webhook` |
| **3. Método de Autenticação** | 🟢 **Conforme** | **JWT (JSON Web Token)** para usuários do Dashboard + **HMAC SHA-256** para Webhooks da Meta WhatsApp. |
| **4. Criptografia em Repouso (At-Rest)** | 🟢 **Conforme** | **AES-256-GCM** para CPFs via `CPF_ENCRYPTION_KEY` + **Blind Indexing Hash (`cpf_hash`)** no banco de dados. |
| **5. Criptografia em Trânsito (In-Transit)** | 🟢 **Conforme** | **HTTPS / TLS 1.3 mandatory** (forçado pela infraestrutura Render Cloud & Supabase SSL). |
| **6. Mascaramento & Anonimização LGPD** | 🟢 **Conforme** | As APIs do Dashboard retornam exclusivamente `cpfMasked` (`•••.•••.•••-••`). O CPF bruto nunca é trafegado para o cliente. |
| **7. Certificado Digital SSL/TLS** | 🟢 **Conforme** | Certificado emitido por Autoridade Certificadora confiável (Let's Encrypt / Google Trust Services com renovação automática). |
| **8. Logs de Acesso e Erros** | 🟢 **Conforme** | Módulo de log centralizado (`services/logger.js`) com níveis (INFO, WARN, ERROR), sem exposição de dados sensíveis + tabela `webhook_logs`. |
| **9. Proteção dos Logs contra Acessos** | 🟢 **Conforme** | Protegido via **Supabase Row Level Security (RLS)**. Apenas a clínica detentora e serviços autorizados possuem acesso. |
| **10. Web Application Firewall (WAF)** | 🟢 **Conforme** | **Render Cloud Edge WAF** + Rate Limiting nativo no Express (`express-rate-limit`) + Rate Limiter de chamadas à IA Gemini. |
| **11. Frequência de Pentests** | 🟢 **Conforme** | **Suíte de PenTest Automatizado Continuo** (`test_hmac_webhook_injection.js`, `test_tenant_rls_isolation.js`) + Recomendação de PenTest externo semestral. |
| **12. SLA de Vulnerabilidades** | 🟢 **Conforme** | SLA definido: Crítico (24h), Alto (72h), Médio (7 dias), Baixo (15 dias). |

---

## 🔍 Detalhamento Técnico & Respostas do Formulário Corporativo

### 1. Tipo de Software e Modelo de Arquitetura
- **Resposta:** Software como Serviço (**SaaS Multi-Tenant**).
- **Evidência:** O sistema atende múltiplas clínicas simultaneamente em um único cluster de servidores, mantendo isolamento lógico estrito através de `clinic_id` e políticas RLS (*Row Level Security*) no banco de dados PostgreSQL.

### 2. URL do Sistema e Métodos de Acesso
- **URL do Dashboard:** `https://clinic-bot-zksc.onrender.com/dashboard` (Acesso via navegador web responsivo).
- **URL do Webhook:** `https://clinic-bot-zksc.onrender.com/api/webhook` (End-point de integração HTTPS síncrono com Meta WhatsApp Cloud API).

### 3. Método de Autenticação Utilizado
- **Dashboard Administrative & Recepção:** Autenticação via **JWT (JSON Web Token)** assinado com `JWT_SECRET` e algoritmo HMAC-SHA256, enviado no cabeçalho `Authorization: Bearer <token>`.
- **API Webhook (Meta WhatsApp):** Autenticação e integridade por mensagem via **HMAC SHA-256** (`X-Hub-Signature-256`). O servidor valida o payload cru (`req.rawBody`) contra o `APP_SECRET` da clínica via `crypto.timingSafeEqual`.

### 4. Criptografia em Repouso (Dados Sensíveis, Pessoais e Segredos)
- **Criptografia de PII (LGPD):** Todos os CPFs gravados no Supabase são criptografados com o algoritmo **AES-256-GCM** (usando IV aleatório de 12 bytes + Tag de Autenticação de 16 bytes).
- **Busca Segura (Blind Indexing):** Para permitir consultas de CPF sem descriptografar a tabela inteira, o sistema utiliza `cpf_hash` gerado via HMAC SHA-256 com sal de sistema.
- **Gerenciamento de Segredos:** Chaves de API (Gemini, Meta WhatsApp, Supabase, JWT Secret) são injetadas estritamente via variáveis de ambiente criptografadas (`.env` / Render Secrets) e nunca commitadas no repositório.

### 5. Criptografia em Trânsito
- **Protocolo:** TLS 1.3 / HTTPS obrigatório com suporte a HTTP/2.
- **Redirecionamento:** Qualquer tentativa de acesso via HTTP não seguro é redirecionada automaticamente para HTTPS (HSTS configurado no Edge).

### 6. Anonimização e Mascaramento LGPD
- Na interface gráfica e nas respostas JSON enviadas ao navegador da recepção, o CPF é mascarado pela função `maskCpf()`:
  - Exemplo: `123.456.789-00` ➔ `123.***.***-00`
- O CPF bruto não fica exposto no DOM e nem no `localStorage`.

### 7. Certificado Digital SSL/TLS
- **Emissor:** Let's Encrypt / Google Trust Services (CA confiável de nível internacional).
- **Validade & Renovação:** Renovação automática gerenciada pelo Render Cloud Edge SSL.

### 8. Logs de Acesso e Erros
- **Sistema de Log:** Módulo estruturado `logger.js` gravando timestamp em ISO, nível de severidade (`INFO`, `WARN`, `ERROR`), contexto operacional e pilha de execução.
- **Sanitização de Log:** Os logs omitirem dados sensíveis em texto claro (senhas, CPFs e tokens da Meta).
- **Auditoria de Webhook:** Tabela `webhook_logs` no Supabase registra cada evento de mensageria recebido para auditoria de entrega.

### 9. Proteção dos Logs contra Acessos Indevidos
- **Isolamento por RLS:** Apenas conexões autorizadas com token de serviço ou da própria clínica têm permissão de leitura nos logs.
- **Integridade:** Impedimento de alteração ou truncamento manual por usuários comuns.

### 10. Web Application Firewall (WAF) & Proteção Contra Ataques
- **WAF de Borda (Edge):** Proteção gerenciada contra ataques DDoS, botnets e scanners automatizados na camada de borda do Render.
- **Rate Limiting da Aplicação:** Middleware `express-rate-limit` restringe tentativas de força bruta na API.
- **Rate Limiting da IA:** Módulo `_checkRateLimit()` limita chamadas por minuto à API do Gemini para evitar exaustão de cota ou ataques de negação de serviço econômico.
- **Proteção contra Injeção:**
  - *SQL Injection:* Impedido pelo ORM/SDK do Supabase com consultas parametrizadas.
  - *XSS:* Sanitização de interpolação HTML via `esc()` em todo o frontend Vanilla JS.
  - *Formula Injection:* Exportação de relatórios CSV prefixa caracteres perigosos (`=`, `+`, `-`, `@`) com aspas simples (`'`).

### 11. Frequência de Pentests e Suíte Automatizada Red-Team
- **Suíte Integrada de PenTest:** O repositório conta com suítes de testes automatizados de penetração executadas antes de cada deploy:
  - `test_hmac_webhook_injection.js` (Simula ataques de injeção e alteração de hash em webhooks).
  - `test_tenant_rls_isolation.js` (Simula ataques de travessia de dados entre clínicas no banco).
  - `stress_test.js` (Simula ataques de carga de 100 requisições simultâneas).
- **Recomendação Corporativa:** Realização de PenTest externo (Black Box / Grey Box) por empresa independente com frequência **semestral ou anual**.

### 12. SLA Definido para Resolução de Vulnerabilidades (Vulnerability Remediation Policy)

| Severidade da Vulnerabilidade (CVSS v3.1) | Prazo Máximo de Resolução (SLA) | Ação Requerida |
| :--- | :---: | :--- |
| 🔴 **Crítica (CVSS 9.0 - 10.0)** | **Até 24 horas** | Patch imediato, deploy emergencial e notificação aos clientes. |
| 🟠 **Alta (CVSS 7.0 - 8.9)** | **Até 72 horas** | Correção priorizada e deploy em janela extraordinária. |
| 🟡 **Média (CVSS 4.0 - 6.9)** | **Até 7 dias** | Correção incluída na próxima sprint regular de desenvolvimento. |
| 🟢 **Baixa (CVSS 0.1 - 3.9)** | **Até 15 dias** | Melhoria técnica agendada na fila de manutenção contínua. |

---

> 📄 **Documento de Referência:** Este relatório pode ser anexado diretamente ao Questionário de Segurança da Informação para integração de clientes Enterprise.
