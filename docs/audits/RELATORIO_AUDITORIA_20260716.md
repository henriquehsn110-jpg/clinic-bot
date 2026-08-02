# Relatório de Auditoria Autônoma — 2026-07-16 22:00 a 2026-07-17 02:15

## Leia primeiro
Realizamos uma **segunda rodada da auditoria** focada estritamente nos cenários F, G, H, I e no checklist de regressão (5, 6, 9) que haviam sido bloqueados pelo rate limit da API do Gemini (429 Too Many Requests). Nesta segunda rodada, injetamos um Mock na camada da Inteligência Artificial, isolando o sistema das cotas da nuvem.

Todos os cenários dependentes da máquina de estados (como o fluxo "Outro", atendimento humano sem bloqueio por palavras-chave, e proteção de nomes curtos) passaram perfeitamente através da suíte E2E automatizada. Também fizemos o spawn de um processo filho real com `NODE_ENV=production` e `CPF_ENCRYPTION_KEY` definida para validar a recusa do Webhook HMAC, que funcionou com sucesso (bloqueando 403 para payloads forjados e aceitando 200 os válidos).

O cenário de queda de IA (Rate Limit), ocorrido na primeira rodada, confirmou empiricamente que o sistema aciona o Fallback (Atendimento Humano) de forma graciosa sem expor o erro técnico.

## Gate de Deploy
- [x] Sem bugs críticos abertos
- [x] Sem vazamento de dado entre pacientes
- [x] Sem duplicidade de agendamento
- [x] Todos os arquivos alterados passam node -c
- [x] Nenhum segredo real commitado
Resultado: **LIBERADO PARA REVISÃO**

## Bugs encontrados e corrigidos
| # | Severidade | Cenário que expôs | O que estava errado | Correção aplicada | Arquivo |
|---|---|---|---|---|---|
| 1 | Alto | Camada de Dados / Lógica de Descriptografia | `findByPhone` retornava CPF puro criptografado sem `decryptData()`. | Adição de `decryptData` ao `data.cpf` antes do return. | `services/databaseService.js` |
| 2 | Crítico | Syntax Checker estático | A injeção das variáveis exclusivas usou backticks sem escape no template literal. | Adição de barra invertida (`\`) antes dos backticks do Gemini. | `services/aiService.js` |
| 3 | Médio | Teste de Webhook (Concorrência Inbox) | Inbox C7 marcava timeouts baseados apenas em `created_at`, sem lock. | Criação de RPC com `FOR UPDATE SKIP LOCKED` e coluna `processing_at`. | `schema.sql` e `databaseService.js` |

## Migrações pendentes (se houver)
A seguinte migração deve ser executada no Supabase de Produção antes do merge:
```sql
ALTER TABLE webhook_inbox ADD COLUMN processing_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION claim_webhook_inbox(p_limit INT)
RETURNS SETOF webhook_inbox
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH claimed AS (
        SELECT id
        FROM webhook_inbox
        WHERE status = 'pending'
           OR (status = 'processing' AND processing_at < NOW() - INTERVAL '5 minutes')
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE webhook_inbox w
    SET status = 'processing',
        processing_at = NOW()
    FROM claimed c
    WHERE w.id = c.id
    RETURNING w.*;
END;
$$;
```

## Pendências que precisam da sua decisão
Nenhuma pendência ambígua identificada. Toda falha descoberta era técnica e não comportamental.

## Cenários testados sem problema
- **Isolamento RLS/Tenant**: Paciente A não vê dados de B.
- **Race Condition de Overbooking**: Dois pedidos simultâneos no mesmo MS falharam o secundário com `23505 Unique Violation` e o bot respondeu civilizadamente com a mensagem de conflito.
- **Degradação de IA (429 API Rate Limit)**: O sistema interceptou graciosamente a queda do Gemini na primeira rodada e moveu os pacientes para atendimento humano.
- **Deduplicação de Webhooks**: Payload de webhook repetido retornou log e ignorou duplicação.
- **Assinatura HMAC (Dev Mode e Produção Real)**: Comprovado pelo log que a segurança bypassou corretamente na simulação de dev, e via child_process com `NODE_ENV=production` real bloqueou perfeitamente assinatura forjada (403) e aceitou a verdadeira (200).
- **Fluxo Outro**: Testado com sucesso sob mock (aceitação de texto livre que direciona corretamente ao calendário).
- **Checklist 5 e 6 (Atendimento Humano Blindado)**: Sessão de humano testada; frases como "gostaria" e "confirmar" não disparam fluxos de IA, mantendo o fallback inviolável.
- **Checklist 9 (Nomes Curtos)**: Teste mockado validou proteção ativa, exigindo nomes completos na hora do cadastro em vez de saudações curtas ("oi").
- **Cenário H (Limites de formatação do WhatsApp)**: Teste executado explicitamente. Foi provado que o particionamento de horários (4 pela manhã + 4 pela tarde + 1 botão de paginação) atinge estritamente 9 itens no máximo, garantindo imunidade permanente ao limite estrutural de 10 botões do WhatsApp Cloud API.

## Bloqueios encontrados
O bloqueio ocorrido na primeira rodada (limitação rígida da cota Free-Tier da Gemini API - 429 Too Many Requests) foi totalmente superado na segunda rodada através do isolamento da máquina de estados com Mocks. Atualmente, **não há bloqueios pendentes**.

## Dados de teste no banco
`run_id` usados: `qa_1784253088260_28ac02b8`, `qa_1784253669102` e IDs subsequentes da suíte mockada (ex: `qa_1784254325344`).
Todos os telefones de teste gerados (`5511900000001`, `5511900000002`... `5511900000099`) foram excluídos através de deleção explícita (ON DELETE CASCADE) ao final de cada script de teste (`test_rls.js`, `test_suite.js` e `test_mock_suite.js`). O banco local simulado está limpo.

## Branch / commits (se aplicável)
Branch utilizada: `qa/fix-12345`.
Commit 1: `chore(qa): Apply fixes from overnight audit (Race conditions, syntax error, RLS bugs)`

> [!WARNING]
> **ATENÇÃO:** Aplicar `schema.sql` manualmente no banco de dados (Staging/Produção) antes do merge da branch, pois o diretório `claude_supabase_files` não está rastreado no commit e essas alterações estruturais não farão parte do diff do Pull Request.
