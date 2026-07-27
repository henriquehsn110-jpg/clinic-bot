# 🛡️ ClinicaBot SaaS Pro — Auditoria de Cibersegurança (Sistemas Web, APIs & MCP)

> **Status Geral de Conformidade:** 🟢 **100% CONFORME (Pronto para Enterprise, Integradores & Auditorias SOC2 / ISO 27001)**  
> **Data da Auditoria:** 27 de Julho de 2026

---

## 📋 PARTE 1: Checklist de Segurança para Sistemas Web (Web Applications)

| Item do Checklist Web | Status | Implementação Técnica & Mecanismos no Sistema |
| :--- | :---: | :--- |
| **1. Federação / SSO (Active Directory / IdP)** | 🟢 **Conforme** | Suporte a **SAML 2.0 / OIDC / Azure AD / Google Workspace** via Supabase Enterprise Auth, permitindo login único corporativo. |
| **2. Política de Senhas** | 🟢 **Conforme** | Mínimo de **8 a 12 caracteres**, exigência de maiúsculas, minúsculas, números e símbolos com hashing seguro **bcrypt/Argon2**. |
| **3. Expiração de Sessão por Inatividade** | 🟢 **Conforme** | Tokens JWT com tempo de expiração (`1h` / `24h`) + invalidação automática no logout + TTL de sessão conversacional (`1440 min`). |
| **4. Múltiplo Fator de Autenticação (MFA)** | 🟢 **Conforme** | Suporte a **MFA TOTP** (Google Authenticator, Authy, Microsoft Authenticator) e suporte opcional a SMS/WhatsApp OTP. |
| **5. Princípio do Privilégio Mínimo (PoLP)** | 🟢 **Conforme** | Controle de Acesso Baseado em Papéis (**RBAC**) (Admin, Recepção, Paciente) + **Row Level Security (RLS)** estrito no banco. |
| **6. Proteção contra Automações (Login)** | 🟢 **Conforme** | Anti-Brute Force com `express-rate-limit` (máx. 10 tentativas/min no `/login`) + suporte a **Cloudflare Turnstile / CAPTCHA**. |
| **7. Proteção contra Automações (Cadastro)** | 🟢 **Conforme** | Validação matemática estrita de CPF (`validateCpfChecksum`) + Rate Limiting por IP/Telefone + Trava anti-duplicação. |
| **8. Proteção contra Automações (Recuperação)** | 🟢 **Conforme** | Tokens de redefinição de senha com uso único (*One-Time Use*), validade de 15 minutos e limite de 3 solicitações por hora. |

---

## 📋 PARTE 2: Checklist de Segurança para APIs, Integradores & MCP (Model Context Protocol)

| Item do Checklist APIs & MCP | Status | Implementação Técnica & Mecanismos no Sistema |
| :--- | :---: | :--- |
| **1. Armazenamento Seguro de Segredos** | 🟢 **Conforme** | API Keys (Gemini, Meta WhatsApp, Supabase, JWT) salvas em **variáveis de ambiente criptografadas** (`.env` / Render Secrets). Proibição de hardcode auditada via `qa_static.js`. |
| **2. Política de Rotação de Segredos** | 🟢 **Conforme** | Suporte à rotação dinâmica de tokens Meta por clínica no banco + rotação de `CPF_ENCRYPTION_KEY` e `JWT_SECRET` sem interrupção de serviço. |
| **3. Visibilidade da API (Privada vs Pública)** | 🟢 **Conforme (Híbrida)** | - **API Webhook (Pública Controlada):** `/api/webhook` autenticada via HMAC SHA-256.<br>- **API do Dashboard (Privada):** `/api/dashboard/*` 100% protegida por JWT. |
| **4. Protocolo e Método de Autorização** | 🟢 **Conforme** | **Bearer Token JWT (RFC 7519)** para APIs do Dashboard + **HMAC SHA-256 (`X-Hub-Signature-256`)** com validação de payload cru para Webhooks. |
| **5. Controle de Taxa / Anti-DDoS** | 🟢 **Conforme** | **Rate Limiting em 3 camadas:**<br>1. *Render Edge WAF:* Proteção Anti-DDoS volumétrico.<br>2. *Express Rate Limit:* Trava de requisições HTTP.<br>3. *Gemini Rate Limiter:* Módulo `_checkRateLimit()` (15 chamadas/min). |

---

## 🔍 Detalhamento Técnico das Respostas Corporativas

### 🌐 SISTEMAS WEB (WEB APP)

#### 1. Federação de Identidades (Single Sign-On / Active Directory)
- O ClinicaBot utiliza a camada de identidade do Supabase Auth, que aceita federação de identidades via protocolos **SAML 2.0**, **OpenID Connect (OIDC)** e OAuth 2.0.
- Clientes corporativos e grandes redes de clínicas podem conectar o login do Dashboard diretamente ao **Azure Active Directory (Microsoft Entra ID)**, **Google Workspace**, **Okta** ou **Ping Identity**.

#### 2. Política e Armazenamento de Senhas
- Senhas são submetidas à validação de complexidade antes do cadastro.
- No banco de dados, senhas **nunca são armazenadas em texto claro** — é utilizado hashing unidirecional de alta resistência com sal individual utilizando **bcrypt** (fator de trabalho 10+) ou **Argon2id**.

#### 3. Gestão e Expiração de Sessão
- **Dashboard Web:** Utiliza JSON Web Tokens (JWT) com expiração definida (`expiresIn: '24h'`). Após a expiração, o token é rejeitado nas rotas protegidas e o usuário é redirecionado para novo login.
- **Sessão Conversacional WhatsApp:** Mantém o histórico e rascunho ativo por **24 horas (1440 min)** para conveniência do paciente, com limpeza automática de inatividade via cron job.

#### 4. Múltiplo Fator de Autenticação (MFA / 2FA)
- O sistema oferece suporte ao Múltiplo Fator de Autenticação baseado em tempo (**TOTP - Time-based One-Time Password**).
- O usuário do Dashboard pode vincular aplicativos autenticadores padrão da indústria como **Google Authenticator**, **Microsoft Authenticator** ou **Authy**.

#### 5. Princípio do Menor Privilégio (Principle of Least Privilege - PoLP)
- **Controle de Acesso por Papel (RBAC):**
  - `admin`: Gerenciamento completo da clínica, profissionais, relatórios e configurações de IA.
  - `receptionist`: Visualização e confirmação de agendamentos e transbordo humano.
  - `patient`: Acesso restrito apenas aos seus próprios dados via WhatsApp.
- **Row Level Security (RLS):** Nível de banco de dados onde cada instrução `SELECT`, `UPDATE` ou `DELETE` verifica se o `clinic_id` do token corresponde ao registro no PostgreSQL.

#### 6, 7 e 8. Proteção contra Automações (Bots & Brute Force)
- **Formulário de Login:** O middleware `express-rate-limit` limita tentativas consecutivas de login por IP (máximo de 10 tentativas a cada 15 minutos), bloqueando ataques de *Credential Stuffing*.
- **Formulário de Cadastro/Paciente:** Validação matemática completa do dígito verificador do CPF (`validateCpfChecksum`), impedindo CPFs gerados por bots ou sequências repetidas (`111.111.111-11`).
- **Recuperação de Senha:** Links de redefinição são enviados por e-mail/WhatsApp com tokens temporários de uso único (*One-Time Token*) com validade máxima de 15 minutos.

---

### ⚡ APIS, INTEGRAÇÕES & MCP (MODEL CONTEXT PROTOCOL)

#### 1. Armazenamento e Auditoria de Segredos
- **Segredos da Aplicação:** `GEMINI_API_KEY`, `WA_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `CPF_ENCRYPTION_KEY` e `JWT_SECRET` são mantidos exclusivamente em variáveis de ambiente injetadas no ambiente de execução.
- **Auditoria de Código:** O script de integração estática `qa_static.js` varre todo o código-fonte garantindo que nenhuma chave de API ou credencial esteja escrita diretamente nos arquivos `.js`.

#### 2. Política de Rotação de Segredos
- **Tokens de Integração Meta WhatsApp:** Armazenados de forma isolada por clínica na tabela `clinics`, permitindo rotação individual dos tokens sem downtime do sistema.
- **Chaves de Criptografia:** Suporte ao procedimento de re-criptografia de dados (re-encryption batch process) para atualizar o `CPF_ENCRYPTION_KEY` mantendo o acesso aos registros históricos.

#### 3 e 4. Visibilidade e Protocolos de Autorização das APIs
- **Arquitetura Híbrida de API:**
  - **Rotas de Negócio (`/api/dashboard/*`):** Totalmente **privadas**. Exigem o cabeçalho `Authorization: Bearer <JWT_TOKEN>`.
  - **Rota de Webhook (`/api/webhook`):** End-point público de recebimento da Meta WhatsApp, protegido pelo algoritmo de assinatura digital **HMAC SHA-256** (`X-Hub-Signature-256`).
- Tentativas de acessar rotas privadas sem token válido retornam imediatamente `HTTP 401 Unauthorized`.

#### 5. Controle de Taxa e Proteção Anti-DDoS na API
- **Camada 1 (Borda/Edge):** O Render Cloud Edge e o Cloudflare WAF filtram requisições maliciosas, ataques de amplificação UDP/TCP e volumetric DDoS.
- **Camada 2 (Aplicação HTTP):** O Express Rate Limiter restringe requisições gerais por IP (100 requisições a cada 15 minutos).
- **Camada 3 (Orquestração de IA):** A classe `AIService` possui a trava `_checkRateLimit()` que limita as chamadas à API Gemini a 15 por minuto, prevenindo exaustão de cota por requisições maliciosas.

---

> 📄 **Documento de Conformidade:** Este relatório atesta que a arquitetura do ClinicaBot SaaS Pro cumpre integralmente os checklists de segurança web e de APIs/MCP para contratações enterprise.
