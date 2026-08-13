# MEMORY.md — Memória de Longo Prazo (ClinicaBot SaaS Pro)

> **Regra de Ouro:** Este arquivo contém o conhecimento histórico acumulado de correções, decisões arquiteturais e padrões do projeto. Todo agente DEVE consultar este arquivo antes de proferir diagnósticos ou alterações estruturais.

---

## 📌 Histórico de Erros & Soluções (Memory Entries)

#### 44. Falso Positivo no Contador de Tentativas de CPF (`CPF_RETRY_LIMIT`) & Reconhecimento de Respostas de Nome
- **Sintoma:** Em simulação de fuzzing com paciente indeciso (`indecisiveFlow`), a alteração sucessiva de datas/horários seguida do envio de nome ("Meu nome é...") fazia a FSM disparar indevidamente o erro `CPF_RETRY_LIMIT` ("Limite de 2 tentativas de CPF atingido... Transferindo para atendimento humano").
- **Causa Raiz:** (1) A checagem `wasCpfRequested` no `conversationController.js` contava qualquer resposta que não contivesse `rawCpf` nem `isBypassKeyword` como uma tentativa inválida de CPF. Quando o usuário enviava seu nome ("Meu nome é..."), o backend não reconhecia a frase como uma resposta de nome, contando-a como um erro de CPF. (2) Uma vez que o CPF era fornecido no turno seguinte, ao clicar no botão "Confirmar", a trava `wasCpfRequested` re-avaliava o histórico antigo e disparava o handoff humano porque `hasCpf` não era verificado no início do bloco de retentativa.
- **Resolução:** (1) Adicionado `hasCpfEarly` na condição de entrada de `wasCpfRequested`, impedindo que pacientes com CPF já fornecido caiam no contador de erros; (2) Criada a trava `isNamePhrase` (identificando expressões como "meu nome é", "sou o", "chamo-me" e `extractCleanName`) e incluída em `isBypassKeyword`, evitando que respostas contendo nomes sejam contabilizadas como falhas de CPF. Validado com 100% de sucesso via `tests/run_conversation_matrix_fuzzing.js` (8/8 PASS em Staging).

#### 45. Resolução de Loop de Recusa em Agendamento Familiar & Rejeição de CPF do Titular no Dependente
- **Sintomas Detectados em Produção:**
  1. *Loop Infinito sem Botões*: Quando o paciente recusava informar o nome no agendamento de dependente (ex: *"Não quero informar"*, *"Desisti"*), o sistema ignorava a recusa e reenviava a pergunta seca sem botões em loop.
  2. *Bypass de CPF do Titular & Hash Mismatch*: Quando o paciente informava seu próprio CPF de titular durante o agendamento de dependente, o sistema aceitava sem checar se pertencia ao titular. Além disso, `patients.updateCpf` armazenava a hash do CPF com pontuação (`hashForSearch('403.324.218-05')`), enquanto `findByCpf` buscava apenas a hash numérica (`hashForSearch('40332421805')`), impedindo o match de hash na busca.
- **Resolução Implementada:**
  1. *Gate 1 & Gate 2 (Recusa & Escape)*: Adicionada detecção de expressões de recusa (`isRefusal`). Se detectada, cancela o agendamento de dependente, reseta `is_family_booking = false` e responde com botões interativos `["Agendar para mim", "Falar com atendente", "Cancelar agendamento"]`.
  2. *Rejeição de CPF do Titular (Regra 17)*: Adicionada validação `cleanEarlyCpf === cleanPatientCpf`. Se o titular tentar usar seu próprio CPF no dependente, o sistema rejeita e solicita o CPF específico do dependente.
  3. *Unificação de Hashing de CPF & Resiliência*: Ajustado `patients.updateCpf` e `patients.findByCpf` em `services/databaseService.js` para limpar caracteres não-numéricos (`replace(/\D/g, '')`) ANTES de calcular `hashForSearch`, garantindo 100% de precisão nos matches. Além disso, `updateCpf` passou a utilizar `.is('deleted_at', null).limit(1).maybeSingle()` para eliminar falhas de PostgREST `23505`.
  4. *Validação:* Criada suíte automatizada `tests/test_family_booking_refusal_and_cpf_validation.js` (3/3 PASS) e expandida a suíte noturna `tests/run_night_suite.js` para 6 suítes (100% GREEN).
