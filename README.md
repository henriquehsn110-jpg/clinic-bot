# 🏥 ClinicaBot SaaS Pro

[![Nightly QA Test Suite](https://github.com/henriquehsn110-jpg/clinic-bot/actions/workflows/nightly-qa.yml/badge.svg)](https://github.com/henriquehsn110-jpg/clinic-bot/actions/workflows/nightly-qa.yml)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)
![License](https://img.shields.io/badge/license-Proprietary-blue)
![Security](https://img.shields.io/badge/security-HMAC%20SHA--256%20%7C%20RLS%20Isolated-success)

Sistema inteligente de agendamento, atendimento e remarketing via WhatsApp para clínicas de odontologia e saúde com inteligência artificial "Ana".

---

## 🌟 Funcionalidades Principais

- 🤖 **IA "Ana" com Máquina de Estados (FSM)**: Fluxos inteligentes de agendamento, cancelamento, reagendamento e dúvidas de preço.
- 🛡️ **Segurança LGPD & Multi-Tenant**: Isolamento por Row Level Security (RLS) no Supabase, mascaramento de CPF e criptografia AES-256.
- 🔐 **Webhooks Blindados**: Validação de assinatura HMAC SHA-256 em todas as requisições recebidas da Meta/WhatsApp.
- 📊 **Dashboard SaaS Pro**: Painel responsivo Vanilla CSS/JS com visualização em tempo real do pipeline conversacional.
- 🌙 **Suíte de Testes Noturnos (CI/CD)**: Bateria automatizada de 5 suítes rodando no GitHub Actions com logs em fuso horário BRT.

---

## 🧪 Suíte de Testes Automatizados (QA)

A suíte pode ser executada localmente contra o ambiente de **Staging**:

### Windows (1-Clique)
Execute o arquivo `run_nightly.bat` na raiz do projeto.

### Terminal (Command Line)
```bash
cmd.exe /c "set \"DOTENV_CONFIG_PATH=.env.staging\" && node -r dotenv/config tests/run_night_suite.js"
```

### GitHub Actions (Nuvem)
O workflow [`.github/workflows/nightly-qa.yml`](.github/workflows/nightly-qa.yml) é executado automaticamente todos os dias às 00:00 BRT (03:00 UTC) ou manualmente via aba **Actions**.

---

## 🚀 Estrutura de Ambientes

- **Staging (`clinicabot-staging`)**: `https://eywcovvwgccslqfnxaws.supabase.co`
- **Produção (`clinicabot-prod`)**: `https://clinic-bot-zksc.onrender.com`
