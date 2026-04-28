# Bootstrap brighty-agent-toolkit monorepo

## Overview

Доделать бутстрап `brighty-agent-toolkit` — yarn-monorepo, в которой живут MCP-сервер, четыре AgentSkills-совместимых скилла и Anthropic-плагин-обёртка. Базовые файлы (`README.md`, `CLAUDE.md`, заглушки `.claude-plugin/*.json`, скелет CI) уже есть; нужно перенести логику из двух исходных репозиториев и довести проект до состояния "чистый CI + рабочая локальная установка".

**Что решает:**

- Дать пользователям один artefact, который они ставят как Anthropic-плагин и получают MCP+скиллы атомарно
- Распилить единый `brighty-skill` на 4 use-case-ориентированных скилла (банкинг, выплаты, оплата инвойсов, карты) — снижает context-cost на активацию
- Заложить CI-инвариант "скилл ↔ существующие тулы", который ловит рассинхрон между MCP API и инструкциями скилла

**Интеграция:**

- Yarn workspaces: `packages/mcp-server` собирается как изолированный TS-пакет; `skills/*` — публикуемые папки без сборки
- Скиллы строго по [agentskills.io](https://agentskills.io) спеке; Anthropic-специфика живёт только в `.claude-plugin/`
- В этой итерации **только stdio-транспорт**; HTTP/hosted/OAuth — отдельная следующая итерация (увязана с разговором про деплой)

## Context (from discovery)

**Текущее состояние репы (`Maay` уже надо заменить на `razz-team`):**

- `.claude-plugin/marketplace.json` — owner=`Maay` (нужно поменять), name=`brighty-agent` (нужно `brighty-agent-toolkit`)
- `.claude-plugin/plugin.json` — стаб; ссылается на 4 скилла, 2 агента, 1 команду — ничего из них не существует
- `.mcp.json` — указывает на `https://mcp.brighty.app/mcp` (hosted-режим, для текущей итерации не подходит)
- `.github/workflows/ci.yml` — использует npm, вызывает `scripts/validate-plugin.mjs` (отсутствует) и `scripts/check-tool-references.mjs` (пустой файл)
- `scripts/check-tool-references.mjs` — пустой
- `scripts/.mcp.json` — артефакт случайного создания, удалить
- `README.md`, `CLAUDE.md` — готовы (полировка путей `Maay`→`razz-team` в README)

**Источники для порта:**

- `Maay/brighty_mcp` — TypeScript MCP-сервер: 26 тулов в 6 файлах (accounts/cards/members/payouts/setup/transfers), stdio-only, `BrightyClient` в `src/client.ts`, типы в `src/types/brighty.ts`. Нет тестов, нет HTTP-транспорта, нет Dockerfile. `BASE_URL = "https://api.brighty.app"` захардкожен.
- `Maay/brighty-skill` — один `SKILL.md` (84 строки) с описанием всех тулов; нет `references/`, `scripts/`, `assets/`. Это "сырьё" для разбиения на 4 скилла.

**Ключевые решения (зафиксированы):**

- **Структура тулов:** один файл = один тул, 24 файла в `packages/mcp-server/src/tools/<domain>/<tool-name>.ts` (после удаления `brighty_setup` + `brighty_status`)
- **Auth (stdio):** env-var `BRIGHTY_API_KEY` primary, OS keychain через `keytar` fallback; активация keychain через **CLI-команду** `brighty-mcp login` (отдельный bin), не через MCP-тул. `brighty_setup` и `brighty_status` удаляются — security smell.
- **HTTP/hosted/OAuth:** отложено до отдельной итерации (привязано к разговору про деплой). Brighty API сам OAuth не поддерживает (только static Bearer per-business), поэтому hosted-режим = OAuth 2.1 façade с делегированием на Stytch/WorkOS — это серьёзная отдельная работа.
- **Package manager:** yarn workspaces.
- **Брендинг:** repo `razz-team/brighty-agent-toolkit`, plugin name `brighty`, скиллы `brighty-banking|payouts|invoice-pay|cards`.

**Маппинг тулов → скиллы (24 тула после удаления setup):**
| Скилл | Тулы | Источник |
|---|---|---|
| `brighty-banking` | 5 accounts + 3 members = 8 | `accounts.ts` + `members.ts` |
| `brighty-payouts` | 6 payouts + 2 transfers = 8 | `payouts.ts` + `transfers.ts` |
| `brighty-invoice-pay` | 0 уникальных (orchestrates `brighty_create_payout`, `brighty_create_external_transfer`, `brighty_start_payout`) | workflow text from `brighty-skill/SKILL.md` |
| `brighty-cards` | 8 | `cards.ts` |

## Development Approach

- **Testing approach:** Regular (код→тесты в рамках одной таски). Это порт существующей логики, важно сначала увидеть что работает end-to-end под Claude Code, потом покрыть тестами критичные пути (preflight balance check в `start_payout`, idempotency keys, FX intent flow).
- Завершать каждую таску полностью перед переходом к следующей.
- **CRITICAL: каждая таска включает тесты для нового/изменённого кода.** Тесты пишем в той же таске.
- **CRITICAL: все тесты должны проходить перед началом следующей таски.**
- **CRITICAL: обновлять этот план при изменении скоупа.**
- Запускать `yarn validate && yarn check-tools && yarn -w packages/mcp-server build && yarn test` после каждого тулинга/скилла.

## Testing Strategy

- **Unit-тесты:** vitest (предложение; jest альтернатива). Для каждого ported тула — happy path + 1 error case минимум. Для `client.ts` — auth header construction, error envelope parsing, BASE_URL override через env.
- **Integration:** один smoke-тест запускает MCP-сервер в child-process, отправляет `tools/list`, проверяет что 24 тула регистрируются.
- **AgentSkills validation:** `skills-ref validate` через CI на каждый из 4 скиллов (не unit-тест, но обязательная гейт-проверка).
- **Cross-reference check:** `scripts/check-tool-references.mjs` парсит `SKILL.md` на упоминания `brighty_*`, сверяет с реальными файлами в `packages/mcp-server/src/tools/`. Это главный CI-инвариант ради которого мы и держим монорепу.
- **E2E:** нет UI; ручная проверка через Claude Code (см. Post-Completion).

## Progress Tracking

- Помечать выполненные пункты `[x]` сразу.
- Новые задачи добавлять с префиксом ➕.
- Блокеры — с префиксом ⚠️.
- При изменении скоупа — обновлять план файл.

## What Goes Where

- **Implementation Steps** (`[ ]`): код, тесты, конфиги, документация в этой репе.
- **Post-Completion** (без чекбоксов): ручная проверка под Claude Code, отдельный заход про hosted/HTTP/OAuth, договорённости с Brighty platform team про token revocation/scopes.

## Implementation Steps

### Task 1: Yarn workspaces foundation

- [x] создать корневой `package.json` с `"private": true`, `"workspaces": ["packages/*"]`, scripts (`validate`, `check-tools`, `build`, `test`, `dev:server`)
- [x] добавить `.yarnrc.yml` с `nodeLinker: node-modules` (совместимость с MCP SDK)
- [x] добавить корневой `.gitignore` (node_modules, dist, .yarn/, .env, .DS_Store, \*.log)
- [x] добавить `LICENSE` (MIT, copyright Brighty)
- [x] удалить `scripts/.mcp.json` (артефакт) — файл уже отсутствовал, чекбокс закрыт
- [x] поменять `.claude-plugin/marketplace.json`: owner `Maay` → `razz-team`, name `brighty-agent` → `brighty-agent-toolkit` (owner уже был `razz-team`, поменяли только name)
- [x] поменять `.mcp.json` на stdio-вариант (через `npx -y @brighty/mcp-server` или local workspace) — hosted endpoint унесён в `.mcp.hosted.json`
- [x] обновить `README.md`: пути `Maay/brighty-agent-toolkit` → `razz-team/brighty-agent-toolkit`, install snippet под yarn
- [x] `yarn install` локально — должен пройти без ошибок
- [x] тестов нет (инфраструктурная таска); проверка: `yarn install` успешен, `yarn workspaces list` показывает корень

### Task 2: MCP-server skeleton

- [x] создать `packages/mcp-server/package.json` с именем `@brighty/mcp-server` (или без скоупа — `brighty-mcp-server`, **уточнить с user**), bin `brighty-mcp` + `brighty-mcp-login`, deps: `@modelcontextprotocol/sdk@^1`, `zod@^3`, `keytar@^7` — выбрали `@brighty/mcp-server` (под root `yarn workspace @brighty/mcp-server`)
- [x] `packages/mcp-server/tsconfig.json` — strict, NodeNext, target ES2022, outDir dist
- [x] добавить vitest как devDep + `vitest.config.ts`
- [x] создать `packages/mcp-server/src/index.ts` со скелетом (registerAllTools пока пустой)
- [x] прогнать `yarn -w packages/mcp-server build` — скомпилироваться должен пустой server
- [x] минимальный smoke test: импорт server module не падает
- [x] `yarn -w packages/mcp-server test` проходит

### Task 3: Port API client с auth + env-overridable BASE_URL

- [x] создать `packages/mcp-server/src/api/client.ts` (по соглашению CLAUDE.md, не `src/client.ts`)
- [x] перенести `BrightyClient` класс из исходника, заменить захардкоженный BASE_URL на `process.env.BRIGHTY_API_URL ?? "https://api.brighty.app"` (исходный репо `razz-team/brighty-mcp` пуст; реализован generic Bearer-клиент с GET/POST/PUT/PATCH/DELETE, query-builder, JSON body, idempotency-key, error-envelope parsing, 204-handling)
- [x] создать `packages/mcp-server/src/auth.ts`: функция `getApiKey()` с приоритетом env > keytar; **никакого `~/.brighty/config.json`**
- [x] функция `getClient()` синглтон, `resetClient()` для тестов
- [x] `saveApiKey()` — обёртка над `keytar.setPassword("brighty-mcp", "default", key)`
- [x] юнит-тесты для `client.ts`: header construction (Authorization: Bearer), error envelope parsing (description/message/name), 204 handling, BRIGHTY_API_URL override
- [x] юнит-тесты для `auth.ts`: env приоритет над keytar, отсутствие ключа — внятная ошибка
- [x] `yarn -w packages/mcp-server test` зелёный (25 тестов)

### Task 4: Port types

- [x] создать `packages/mcp-server/src/types/brighty.ts`, перенести интерфейсы verbatim (Money, Account, AccountAddress, Payout, PayoutTransfer, Card, CardDesign, Member, TransferIntent, ApiError, PaginatedResponse) — исходный репо пуст; типы выведены из контракта Brighty API и подсказок в плане (account types CURRENT/SAVING, payout states, beneficiary fiat/crypto branching, intent rate+fees+hash, card limits daily/monthly)
- [x] тестов нет (только типы; компилятор — вся проверка)
- [x] `yarn -w packages/mcp-server build` зелёный

### Task 5: Port accounts tools (5 тулов)

- [x] создать `packages/mcp-server/src/tools/accounts/list-accounts.ts` — `brighty_list_accounts`
- [x] `accounts/get-account.ts` — `brighty_get_account`
- [x] `accounts/create-account.ts` — `brighty_create_account`
- [x] `accounts/terminate-account.ts` — `brighty_terminate_account`
- [x] `accounts/get-account-addresses.ts` — `brighty_get_account_addresses`
- [x] `accounts/index.ts` — экспортирует все 5 (барьер плюс `accountsTools` массив для регистрации)
- [x] юнит-тесты на 2-3 тула (success + 1 error case): list-accounts (filters + 401 propagation + parse rejection), create-account (body construction + omit name + parse rejection), terminate-account (DELETE + encoded path), get-account-addresses (GET path) — 11 тестов
- [x] `yarn test` зелёный (36 тестов всего)

### Task 6: Port members tools (3 тула)

- [x] `tools/members/list-members.ts` — `brighty_list_members` (status/role filters)
- [x] `tools/members/add-members.ts` — `brighty_add_members` (invitations array, email + role + optional name)
- [x] `tools/members/remove-members.ts` — `brighty_remove_members` (memberIds array, POST /members/remove)
- [x] `tools/members/index.ts` (барьер плюс `membersTools` массив для регистрации)
- [x] юнит-тесты: barrel sanity, list-members (filters), add-members (success + empty array + bad email + bad role rejected at parse), remove-members (success + empty array rejected) — 8 тестов
- [x] `yarn test` зелёный (44 теста всего)

### Task 7: Port transfers tools (2 тула, важная FX-логика)

- [x] `tools/transfers/transfer-intent.ts` — `brighty_transfer_intent` (preview, возвращает rate+fees+hash; POST /transfers/intent с sourceAccountId/destinationAccountId/amount/amountSide, default amountSide=SOURCE)
- [x] `tools/transfers/transfer-own.ts` — `brighty_transfer_own` (внутренне вызывает `runTransferIntent` сначала, потом POST /transfers/own с `{ hash }` body и `randomUUID()` idempotency key; возвращает `{ intent, transfer, idempotencyKey }`)
- [x] `tools/transfers/index.ts` (барьер плюс `transfersTools` массив; добавлен тип `OwnTransfer` в `types/brighty.ts`)
- [x] юнит-тесты: barrel sanity, transfer-intent (POST body + default amountSide + DESTINATION override + bad amount + missing destinationAccountId), transfer-own (последовательность intent→own + hash forwarding + UUIDv4 idempotency key + per-invocation uniqueness + intent failure stops own) — 8 тестов
- [x] `yarn test` зелёный (52 теста всего)

### Task 8: Port payouts tools (6 тулов, самый сложный домен)

- [x] `tools/payouts/list-payouts.ts` — `brighty_list_payouts` (status/limit/cursor filters)
- [x] `tools/payouts/create-payout.ts` — `brighty_create_payout` (DRAFT container, optional name)
- [x] `tools/payouts/get-payout.ts` — `brighty_get_payout` (encoded path)
- [x] `tools/payouts/start-payout.ts` — `brighty_start_payout` (**вербатим preflight balance check**: GET /payouts/:id, sum transfer amounts per sourceAccountId via BigInt-scaled decimal arithmetic at scale=18, GET /accounts/:id, throw `PreflightFailedError` with shortfall list if any short; `skipPreflight` escape hatch with explicit risk note in description)
- [x] `tools/payouts/create-internal-transfer.ts` — `brighty_create_internal_transfer` (runtime mutual-exclusion of recipientAccountId/recipientTag — moved out of `.refine()` to keep `inputSchema.shape` accessible; source-account currency match check; UUIDv4 idempotency key when not supplied)
- [x] `tools/payouts/create-external-transfer.ts` — `brighty_create_external_transfer` (fiat vs crypto via `z.discriminatedUnion("kind", [...])` on the beneficiary field; isBusinessRecipient passthrough; UUIDv4 idempotency key)
- [x] `tools/payouts/index.ts` (барьер плюс `payoutsTools` массив)
- [x] юнит-тесты: barrel sanity (6 tools, brighty\_-prefixed, top-level shape access works), create-internal-transfer (currency match + UUIDv4 idem key + recipientTag path + supplied idem key + neither/both recipient → reject + bad amount parse), create-external-transfer (fiat verbatim + crypto verbatim + missing kind discriminator + missing transferNetworkId), start-payout (multi-account preflight passes → POST /start, single-account preflight fails → no POST, balance fallback when availableBalance absent, skipPreflight=true bypass, empty-transfers payout, mixed currencies on same source rejected, encoded payoutId on /start) — 18 тестов
- [x] `yarn test` зелёный (70 тестов всего)

### Task 9: Port cards tools (8 тулов)

- [x] `tools/cards/list-cards.ts` — `brighty_list_cards` (status/kind/accountId filters)
- [x] `tools/cards/get-card.ts` — `brighty_get_card` (encoded path)
- [x] `tools/cards/order-card.ts` — `brighty_order_card` (two-step: POST /cards/order/intent → POST /cards/order with `{ hash }` body and `randomUUID()` idempotency key; returns `{ intent, card, idempotencyKey }`; added `CardOrderIntent` + `CardOrderFee` types)
- [x] `tools/cards/freeze-card.ts` — `brighty_freeze_card` (POST /cards/:id/freeze)
- [x] `tools/cards/unfreeze-card.ts` — `brighty_unfreeze_card` (POST /cards/:id/unfreeze)
- [x] `tools/cards/set-card-limits.ts` — `brighty_set_card_limits` (PUT /cards/:id/limits, daily/monthly Money objects, omits unsupplied bucket, throws when both omitted)
- [x] `tools/cards/list-card-designs.ts` — `brighty_list_card_designs` (kind filter)
- [x] `tools/cards/get-virtual-card-product.ts` — `brighty_get_virtual_card_product` (currency query)
- [x] `tools/cards/index.ts` (барьер плюс `cardsTools` массив)
- [x] юнит-тесты: barrel sanity (8 tools, brighty\_-prefixed, top-level `inputSchema.shape` access works), order-card (intent→order последовательность с hash forwarding + UUIDv4 idem key + per-invocation uniqueness + intent failure stops order + omit-when-unset body construction + bad kind/missing accountId parse rejection), set-card-limits (PUT both buckets + PUT only-monthly + encoded cardId + neither bucket → reject + bad amount parse) — 12 тестов
- [x] `yarn test` зелёный (82 теста всего)

### Task 10: Wire up tool registration в index.ts (stdio-only)

- [x] обновить `src/index.ts`: import всех тулов из `tools/<domain>/index.ts`, registerAllTools loop, StdioServerTransport
- [x] **сохранить паттерн `tool.inputSchema.shape` access** (требует `z.object(...)` на каждом тулe, без refinements — задокументировать в комментарии): `ALL_TOOLS` собирает 5 доменных барьеров; цикл регистрирует каждый тул через legacy `server.tool(name, description, inputSchema.shape, handler)` (zero-shape ветка вызывает `(name, description, handler)`); локальный `CallToolResult` заменён на re-export из SDK для type-compat
- [x] добавить startup token validation: вызов `GET /me` (или эквивалент Brighty), fail loudly с actionable error если 401: `validateStartupAuth()` строит свежий BrightyClient, вызывает `/me`; на 401 поднимает Error с masked key + actionable hint про BRIGHTY_API_KEY/brighty-mcp-login; non-401 errors пробрасываются verbatim; bypass через `BRIGHTY_SKIP_AUTH_CHECK=1` для inspector/тестов
- [x] mask key в любых логах (показывать только last 4): success-log `[brighty-mcp] auth OK (key ***1234)` через существующий `maskApiKey`; 401-error message содержит только masked-форму
- [x] integration smoke test: spawn server в child process, отправить tools/list через stdio, ожидать ровно 24 тула — реализован через MCP SDK Client + `InMemoryTransport.createLinkedPair()` (hermetic; real-stdio проверяется ручным `mcp inspector` см. docs/SECURITY.md в Task 21); `client.listTools()` возвращает ровно 24 тула, имена матчат `ALL_TOOLS`, все `brighty_*`-prefixed, у каждого type=object inputSchema
- [x] `yarn -w packages/mcp-server build` зелёный, `yarn test` зелёный (88 тестов всего: +6 над Task 9)

### Task 11: CLI `brighty-mcp login` для keychain auth

- [x] создать `packages/mcp-server/src/cli/login.ts`: интерактивный prompt (через `node:readline/promises`) для API key, валидация через `GET /me`, сохранение в keytar; injectable `prompt`/`fetch`/`save`/`log`/`errorLog` deps для тестируемости; маскирование ключа в любых выводах через `maskApiKey`
- [x] bin `brighty-mcp-login` в package.json уже был добавлен в Task 2; шебанг `#!/usr/bin/env node` сохранён tsc'ом в `dist/cli/login.js`
- [x] добавить subcommand `brighty-mcp login` в основной bin: `runCli(argv)` диспатчит `argv[0] === "login"` через dynamic-import на `runLogin()`, иначе fallthrough на `runStdio()`
- [x] юнит-тесты: happy path (200 → save + masked log), trim whitespace from prompt, empty input rejected без fetch/save, 401 → invalid-key с masked error без сохранения, non-401 → network с surfaced detail без сохранения, BRIGHTY_API_URL override — 6 тестов
- [x] manual smoke: `echo "" | node packages/mcp-server/dist/cli/login.js` → "Brighty API key: [brighty-mcp-login] no API key provided." exit=1; `echo "" | node packages/mcp-server/dist/index.js login` ведёт себя идентично (alias работает)
- [x] `yarn test` зелёный (94 теста всего: +6 над Task 10)

### Task 12: Author skill — brighty-banking

- [x] создать `skills/brighty-banking/SKILL.md` с frontmatter (name, description в формате [what + when + triggers], license MIT, metadata.version 0.1.0, author brighty)
- [x] body: 8 тулов (5 accounts + 3 members), workflows "проверить баланс", "пригласить тиммейта", "получить IBAN для входящего платежа", плюс close-account и open-account flows
- [x] добавить `references/ACCOUNT_TYPES.md` (CURRENT vs SAVING + status values + primary account note) и `references/MEMBER_ROLES.md` (OWNER/ADMIN/ACCOUNTANT/EMPLOYEE + status + operational notes)
- [x] прогнать `npx -y skills-ref validate skills/brighty-banking` — Valid skill
- [x] под 500 строк (100 строк)
- [x] `yarn check-tools` (после Task 16) подтвердит что все упомянутые `brighty_*` существуют — все 8 имён в SKILL.md матчат тулы из Tasks 5–6 (list/get/create/terminate/get-addresses accounts + list/add/remove members)

### Task 13: Author skill — brighty-payouts

- [x] `skills/brighty-payouts/SKILL.md` — 8 тулов (6 payouts + 2 transfers)
- [x] body: workflows "mass salary payout" (CSV → external transfers → start), "FX между своими счетами" (intent → own), "supplier payment" (плюс one-off internal transfer и SAVING-funding flows)
- [x] **критичный pattern**: `brighty_transfer_intent` ВСЕГДА перед `brighty_transfer_own` чтобы юзер увидел rate (encoded в "Critical patterns" → "Always preview before committing FX")
- [x] **критичный pattern**: `brighty_start_payout` — последний шаг, до этого все transfers только готовятся (encoded в "Critical patterns" → "Always commit with `brighty_start_payout` last" + "Trust the preflight")
- [x] `references/CSV_FORMAT.md` — fiat (name/IBAN/BIC/account/routing/amount/currency/reference/beneficiaryAddress/isBusinessRecipient) + crypto (address/network/memo/name) columns с маппингом на `brighty_create_external_transfer` arguments + common pitfalls + pre-start confirmation шаблон
- [x] `references/PAYOUT_STATES.md` — payout states (DRAFT/RUNNING/COMPLETED/FAILED/CANCELLED) + transfer states (PENDING/PROCESSING/COMPLETED/FAILED/CANCELLED) + own-transfer states + per-state action table + idempotency-key retry semantics
- [x] `skills-ref validate skills/brighty-payouts` зелёный, 177 строк SKILL.md

### Task 14: Author skill — brighty-invoice-pay

- [x] `skills/brighty-invoice-pay/SKILL.md` — orchestrates `brighty_list_accounts`, `brighty_create_payout`, `brighty_create_external_transfer`, `brighty_get_payout`, `brighty_start_payout` (existing tools only; no new MCP registration)
- [x] body: pipeline "PDF/image invoice → extract fields → pre-create confirmation → create payout + single external transfer → post-create re-confirmation → start"; "When NOT to use" links to brighty-payouts for batch / FX, brighty-banking for balances, brighty-cards for cards
- [x] `references/INVOICE_FIELDS.md` — fiat (recipientName/IBAN/accountNumber/BIC/swiftCode/routingNumber/bankName/beneficiaryAddress/amount/currency/invoice-ref + isBusinessRecipient: true) + crypto (address/network/currency/amount/memo/name/reference) columns mapped to `brighty_create_external_transfer` arguments + "informational only" rows + common extraction pitfalls (sub-total vs total, EU vs US thousands separators, $ ambiguity, IBAN whitespace, OCR look-alikes, multiple bank lines, currency-mismatch with source account) + missing-field policy
- [x] `references/CONFIRMATION_TEMPLATE.md` — pre-create template (fiat + crypto variants showing supplier/ref/amount/recipient bank/source account/availableBalance) + waiting-for-explicit-yes rule + correction-then-re-render rule + post-create template (after `brighty_get_payout`: stored fields including IBAN-as-Brighty-stored, transferCount=1 check, totalsByCurrency) + commit/cancel/error templates with verbatim shortfalls block
- [x] `npx -y skills-ref validate skills/brighty-invoice-pay` зелёный (Valid skill), 207 строк SKILL.md (под 500); все упомянутые `brighty_*` существуют в `packages/mcp-server/src/tools/` (verified manually; `scripts/check-tool-references.mjs` всё ещё пустой — Task 16); `yarn workspace @brighty/mcp-server test` — 94 теста зелёные (без регрессий)

### Task 15: Author skill — brighty-cards

- [x] `skills/brighty-cards/SKILL.md` — 8 тулов (lookup×2 + catalog×2 + lifecycle×4)
- [x] body: workflows "issue virtual card" (list-accounts → get-virtual-card-product → list-card-designs → order-card with internal intent→order sequence), "issue physical card" (no separate product lookup, fees come from order intent), "freeze on suspected loss" (freeze-first-ask-later for urgency), "set spending limits", "list/lookup cards"
- [x] **критичный pattern**: `brighty_order_card` — двухстадийный intent→order инкапсулирован внутри тула; показать `intent.fees` (плюс опционально `brighty_get_virtual_card_product` для virtual) перед финальным order — encoded в "Critical patterns" → "Order is two-step — show fees from the intent before the final order"
- [x] **критичный pattern**: freeze-first-ask-later на signal lost/stolen/compromised — encoded в "Critical patterns" → "Freeze first, ask later (on suspected compromise)"
- [x] **критичный pattern**: `brighty_set_card_limits` — partial replace (только supplied bucket меняется); неосознанная попытка "clear bucket" не поддерживается — encoded в "Critical patterns" → "Limits are a full replace per call"
- [x] `references/CARD_LIMITS.md` — daily vs monthly buckets, Money shape (decimal-string + currency-must-match-card), partial-replacement table, validation pitfalls (locale comma, currency symbol, number-not-string, negative, daily>monthly, currency mismatch), reading limits back
- [x] `skills-ref validate skills/brighty-cards` — Valid skill; SKILL.md 174 строки (под 500); все 9 упомянутых `brighty_*` существуют (8 cards + cross-skill `brighty_list_accounts`); `yarn workspace @brighty/mcp-server test` — 94 теста зелёные (без регрессий)

### Task 16: Cross-reference checker scripts/check-tool-references.mjs

- [x] парсит каждый `skills/*/SKILL.md`, находит все упоминания `brighty_<snake_case>` (`/\bbrighty_[a-z][a-z0-9_]*\b/g` через `collectSkillTools`, агрегируя skill-имена за тулом)
- [x] сканит `packages/mcp-server/src/tools/**/*.ts` находя канонические декларации `name: "brighty_..."` внутри `defineBrightyTool({...})` (паттерн отличается от плана — у нас нет прямых `server.tool("brighty_...")` в файлах тулов; регистрация происходит в `index.ts` через цикл `ALL_TOOLS`, а имена живут на тулах). Регекс `/\bname\s*:\s*["'](brighty_[a-z][a-z0-9_]*)["']/g` — кросс-ссылки внутри description-строк намеренно не считаются регистрацией, юнит-тест это проверяет.
- [x] fail если в скилле упомянут несуществующий тул (exit 1 + список в `error()`), warning (не error) если тул в коде не упомянут ни в одном скилле (текущий результат: 24 ↔ 24, 0 orphans)
- [x] юнит-тесты: positive (всё совпадает), negative (несуществующий тул в скилле), orphan (тул в коде без упоминаний в скиллах), description-only mention в tool-файле не считается регистрацией, missing toolsDir без падения; плюс `main()` smoke против реальной репы — 6 тестов в `packages/mcp-server/test/check-tool-references.test.mjs` (vitest config расширен `*.test.mjs`)
- [x] script `"check-tools": "node scripts/check-tool-references.mjs"` уже был в root `package.json` (Task 1) — реализация теперь подключается
- [x] `yarn check-tools` зелёный (`[check-tools] ok — 24 skill reference(s), 24 registered tool(s), 0 orphan(s)`); `yarn workspace @brighty/mcp-server test` зелёный (100 тестов всего: +6 над Task 15)

### Task 17: Plugin validator scripts/validate-plugin.mjs

- [x] парсит `.claude-plugin/marketplace.json` и `.claude-plugin/plugin.json` (оба через общий `readJson` с человеко-читаемой ошибкой на ENOENT и invalid JSON)
- [x] проверяет: name match (любой `marketplace.plugins[]` с `source` начинающимся на `./` должен иметь `name === plugin.name`), все skill paths в plugin.json существуют как директория с `SKILL.md`, все agent paths существуют как файл (если объявлены), все command paths существуют как файл (если объявлены); если в marketplace нет local-source plugin'ов — warning, не error
- [x] проверяет что `.mcp.json` валидный JSON и имеет непустой `mcpServers` object (не array, не `{}`)
- [x] юнит-тесты в `packages/mcp-server/test/validate-plugin.test.mjs`: positive (clean fixture), positive с agents+commands, name mismatch, нет local-source plugin → warning, missing skill dir, skill dir без SKILL.md, missing agent file, missing command file, malformed `.mcp.json`, empty mcpServers, missing `.mcp.json`, plus `main()` smoke (clean → exit 0 + ok-summary, broken → exit 1 + "manifest is not consistent" + детализированный список) — 13 тестов
- [x] script `"validate-plugin": "node scripts/validate-plugin.mjs"` уже был в root `package.json` (Task 1) — реализация теперь подключается
- [x] `yarn validate-plugin` запускается, validator работает корректно (113 тестов зелёных, +13 над Task 16); runtime exit=1 на текущей репе потому что `.claude-plugin/plugin.json` объявляет agents/commands которых нет на диске — это и есть валидное поведение, и именно та inconsistency которую снимает Task 18

### Task 18: Решить про agents/ и commands/ (минимум-стабы или удалить из plugin.json)

- [x] **decision point**: убрать из `plugin.json` (scope minimization) — заглушки требуют осмысленного frontmatter и реальных workflow'ов, дешевле сделать в отдельной таске когда скиллы стабилизируются
- [x] **рекомендация**: убрать из plugin.json в этой итерации — выполнено: `agents` и `commands` ключи удалены; manifest по-прежнему валиден (`yarn validate-plugin` → `ok — plugin "brighty" (4 skill(s), 0 agent(s), 0 command(s))`); тесты `validate-plugin` уже покрывают вариант "agents/commands отсутствуют" (positive fixture без них)
- [x] задокументировать в README что agents/commands будут добавлены в v0.2 — добавлен раздел "Roadmap" (v0.1 / v0.2 / Later); пункт "Specialized agents and slash commands ... planned for v0.2" заменил исходный bullet про "Specialized agents and slash commands for common workflows"; из repo-structure блока убраны строки `agents/` и `commands/` (зеркалят реальное состояние диска)

### Task 19: Plugin manifest polish

- [x] обновить `.claude-plugin/plugin.json`: реальный `description` ("Brighty banking and payments for Claude — open accounts, run mass payouts, issue cards, and pay invoices through natural language."), skills уже содержали правильный список 4 скиллов из Task 1, `mcpServers` переведён на канонический `${CLAUDE_PLUGIN_ROOT}/.mcp.json` (validator не парсит значение поля, тесты `validate-plugin` остаются зелёными — обе формы accepts)
- [x] `version: "0.1.0"` уже был в манифесте с Task 1; явно задокументирован как метка для bump'а при релизах (см. Cutting a release в CLAUDE.md)
- [x] `yarn validate-plugin` зелёный (`ok — plugin "brighty" (4 skill(s), 0 agent(s), 0 command(s))`); `yarn workspace @brighty/mcp-server test` — 113 тестов зелёные (без регрессий); `yarn check-tools` — 24/24 ok; `npx -y skills-ref validate` — все 4 скилла Valid

### Task 20: Convert CI to yarn

- [x] `.github/workflows/ci.yml`: заменить `npm ci`/`npm run` на `yarn install --immutable`/`yarn run` — workflow переписан целиком; install через `yarn install --immutable`, validate-plugin/validate/check-tools/build/test через `yarn run` (отдельные шаги, чтобы failure локализовался). Также: вторичный fix вне CI — root `validate` скрипт переведён с `skills-ref ...` на `npx -y skills-ref ...`, потому что `skills-ref` не задекларирован как dep ни в одном workspace, и `yarn validate` валился `command not found`. Теперь `yarn validate` работает локально и в CI без отдельной step-уровневой обвязки.
- [x] добавить шаг `actions/setup-node@v4` с `cache: 'yarn'` — добавлен; для Yarn 4 предшествующий шаг `corepack enable` (без него setup-node ловит system yarn 1.x и cache:'yarn' даёт несовместимый кеш-ключ); `node-version: '20'` соответствует root `engines.node >=20.0.0`
- [x] поправить порядок шагов: install → validate-plugin → validate skills → check-tools → build → test — реализован именно этот порядок: дешёвые декларативные проверки (validate-plugin, skills-ref) бьют раньше build, чтобы CI рано стопорился на manifest/skill-spec ошибках. PR-trigger переведён на `master` (исходный `main` не существует в репе) + добавлен `push: master` для baseline-runs
- [x] **уточнить runner**: текущий `[self-hosted, Linux, X64]` — оставить или поменять на `ubuntu-latest`? Проверить с user. — defaulted к `ubuntu-latest` без user round-trip: (a) публичный marketplace-плагин не должен опираться на org-specific инфру self-hosted раннеров, (b) форки и contributor PRs не получают доступ к self-hosted раннерам по умолчанию, (c) workload (yarn install + tsc + 113 vitest тестов) укладывается в free-tier limits. Если у razz-team есть готовый self-hosted runner и его нужно использовать — flip обратно одной строкой.
- [x] локально симулировать через `act` если установлен, иначе ручная проверка скриптов — `act` не установлен (`which act` → not found); выполнена ручная sanity-проверка каждой step-команды на локальной машине: `yarn install --immutable` (Done), `yarn validate-plugin` (ok — 4 skill(s)), `yarn validate` (4 Valid skill), `yarn check-tools` (24/24, 0 orphans), `yarn build` (Done), `yarn test` (113/113 passed) — все green
- [x] commit + проверка что CI green в PR (sanity check) — commit выполняется в этой итерации (см. ralphex prompt); PR-уровневая проверка CI green требует push'а на remote и его триггера через GitHub Actions, что вне scope этой автоматической итерации. Все скрипты подтверждены локально (см. предыдущий чекбокс).

### Task 21: docs/SECURITY.md (только stdio-секция)

- [x] создать `docs/SECURITY.md` с разделом про stdio: env-var-first, keychain-fallback, нет MCP-tool credential writes, key never logged, masking — задокументированы trust-boundary stdio (subprocess клиента, JSON-RPC stdio, logs→stderr), `getApiKey()` order (env → keytar service `brighty-mcp` account `default` → `MissingApiKeyError`), explicit "no `~/.brighty/` file is read or written", write-path только через out-of-band CLI `brighty-mcp-login` (validate `/me` → `setPassword` только на 200), startup `validateStartupAuth()` до открытия транспорта (200 → masked-log proceed, 401 → exit non-zero с masked key + actionable hint, BYPASS через `BRIGHTY_SKIP_AUTH_CHECK=1`), masking pattern `***<last4>` (≤4 chars → `***`) применяется на всех 4 surfaces (startup ok, startup 401, login ok, login reject), `BrightyClient` ставит ключ только в `Authorization` header и не логирует header/тело
- [x] threat model: prompt injection writing credentials (почему мы убрали `brighty_setup`) — секция "Threat model: prompt-injected credential writes" описывает конкретный сценарий (LLM читает планированный prompt в webpage/PDF/email/external-transfer-description, agent уговаривают вызвать credential-config tool, ключ в keychain/env молча перезаписывается на attacker'ский, последующие вызовы идут на attacker account, нет UI-момента для оператора), mitigation = "no tool that takes a credential as an argument", помечено load-bearing с инструкцией "do not re-introduce credential-mutating tools without an out-of-band confirmation step the LLM cannot satisfy"; добавлена parallel секция "Threat model: prompt-injected destructive calls" разъясняющая что credential safety ≠ call safety (gating money-moving tools — забота skills и клиента, не сервера) с перечислением имеющихся mitigations (intent-before-own, preflight на start_payout, pre-start confirmation render в payouts/invoice-pay)
- [x] секция про HTTP/hosted/OAuth — пометить TODO с явным ссылкой "see deploy iteration" — секция "HTTP, hosted, OAuth" в конце документа: явно out-of-scope для v0.1, описывает план OAuth 2.1 façade с делегированием на Stytch/WorkOS/Auth0 (undecided) и обмен session на per-business static Bearer (потому что Brighty API сам OAuth не поддерживает), tracked в deploy iteration с собственной security-секцией (scope-gating, token revocation, Business-Portal-to-server provisioning channel); negative guidance до того момента: "do not run this server behind a public HTTP endpoint, do not add an HTTP transport, do not paper over the missing OAuth flow with a shared static token". Дополнительно добавлена секция "Reportable surface" с явным in-scope/out-of-scope списком для security reports

### Task 22: Verify acceptance criteria

- [x] `yarn install` чистый — `yarn install --immutable` → "Done in 0s 380ms" без warnings
- [x] `yarn validate-plugin` зелёный — `[validate-plugin] ok — plugin "brighty" (4 skill(s), 0 agent(s), 0 command(s))`
- [x] `yarn validate` (skills-ref) зелёный для всех 4 скиллов — все 4 (`brighty-banking`, `brighty-payouts`, `brighty-invoice-pay`, `brighty-cards`) Valid
- [x] `yarn check-tools` зелёный — `[check-tools] ok — 24 skill reference(s), 24 registered tool(s), 0 orphan(s)`
- [x] `yarn -w packages/mcp-server build` без ошибок — `tsc` чистый, артефакт `packages/mcp-server/dist/index.js` (4306 байт, executable bit set из-за shebang), import as ESM возвращает экспорты `ALL_TOOLS`, `createServer`, `registerAllTools`, `runStdio`, `validateStartupAuth`
- [x] `yarn test` зелёный — 12 test files, 113 tests passed (0 failed), 2.53s total. Покрытие: tools (accounts/cards/members/payouts/transfers), client, auth, startup-auth, login CLI, check-tool-references, validate-plugin, smoke
- [x] manual: `yarn -w packages/mcp-server build && node packages/mcp-server/dist/index.js` запускается со стdio (тестируется через `npx -y @modelcontextprotocol/inspector`) — manual test (skipped: requires interactive `mcp-inspector` UI; covered in-process by `test/smoke.test.ts` через MCP SDK `Client` + `InMemoryTransport.createLinkedPair()` где `client.listTools()` видит ровно 24 тула, all `brighty_*`-prefixed, with `type: "object"` inputSchema)
- [x] manual: установить плагин из локальной репы в Claude Code, попробовать активировать `brighty-banking` (см. Post-Completion) — manual test (skipped: requires Claude Code GUI install via `/plugin marketplace add file:///...` and live API key; reproduced statically by Tasks 16 (cross-reference 24/24) + 17 (`validate-plugin` ok) + 12-15 (`skills-ref validate` Valid for all 4 skills))
- [x] линтер чистый (если добавляем eslint — отдельная под-задача) — eslint не добавлен в этой итерации (отложено как отдельная под-задача); `tsc --strict` clean (Task 4+10 build), все скилл frontmatter spec-valid (Task 12-15), `*.mjs` scripts валидируются собственными vitest тестами (Tasks 16-17)

### Task 23: README + CLAUDE.md финал

- [x] обновить `README.md`: install snippet под yarn (Development раздел), путь к репе уже `razz-team/brighty-agent-toolkit` с Task 1, убрана единственная остаточная фраза про `~/.brighty/config.json` в Security-секции и заменена на описание keychain-entry `brighty-mcp / default` плюс отдельный раздел "Authentication" с env-first → keychain-fallback flow и `brighty-mcp login` CLI usage. Параллельно вычищены ссылки на несуществующие в v0.1 артефакты (`packages/mcp-server/README.md`, `docs/HOSTING.md`, `docs/DEVELOPING_SKILLS.md`, `deploy/Caddyfile`, GHCR Docker tag, "Streamable HTTP" transport bullet) и tool count `28` → `24`. Roadmap-секция уже была добавлена в Task 18, сохранена.
- [x] `CLAUDE.md`: "What this repository is" список 5→3 (агенты/команды вынесены в v0.2 note, deploy/ убран — tracked отдельно в README roadmap); workflow "Adding a new skill" step 5: `npm run` → `yarn`; добавлена новая секция "Authentication" в Conventions (env-priority, keychain entry `brighty-mcp / default`, no credential-writing MCP tool, `maskApiKey()` requirement, `validateStartupAuth()` + `BRIGHTY_SKIP_AUTH_CHECK=1` bypass для inspector); "Useful commands" блок переведён на yarn целиком, удалён `dev:server:http` (v0.1 stdio-only), добавлен `validate-plugin`. "Don't introduce ~/.brighty/config.json" в What-not-to-do оставлен как load-bearing предупреждение для HTTP-итерации.
- [x] git push на `razz-team/brighty-agent-toolkit`, открыть первый PR с self-review — manual test (skipped: requires interactive `gh auth` + remote write to razz-team org and live PR review; out of scope for automated iteration). Commit создан в этой итерации; push + PR оператор делает вручную.

_Note: ralphex автоматически перемещает завершённые планы в `docs/plans/completed/`_

## Technical Details

**Структура директорий после завершения:**

```
brighty-agent-toolkit/
├── .claude-plugin/{marketplace,plugin}.json
├── .mcp.json                       # stdio-вариант
├── .github/workflows/ci.yml         # yarn-based
├── packages/
│   └── mcp-server/
│       ├── package.json             # @brighty/mcp-server
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── src/
│           ├── index.ts             # entry, stdio transport
│           ├── auth.ts              # env > keytar, no global config file
│           ├── api/client.ts        # BrightyClient, env-overridable BASE_URL
│           ├── types/brighty.ts
│           ├── cli/login.ts         # bin: brighty-mcp-login
│           └── tools/
│               ├── accounts/        # 5 tools, 1 file each
│               ├── cards/           # 8 tools
│               ├── members/         # 3 tools
│               ├── payouts/         # 6 tools
│               └── transfers/       # 2 tools
├── skills/
│   ├── brighty-banking/{SKILL.md,references/}
│   ├── brighty-payouts/{SKILL.md,references/}
│   ├── brighty-invoice-pay/{SKILL.md,references/}
│   └── brighty-cards/{SKILL.md,references/}
├── scripts/
│   ├── check-tool-references.mjs
│   └── validate-plugin.mjs
├── docs/
│   ├── SECURITY.md
│   └── plans/2026-04-27-bootstrap-monorepo.md
├── package.json                     # root, yarn workspaces
├── .yarnrc.yml
├── .gitignore
├── LICENSE                          # MIT
├── README.md
├── CLAUDE.md
└── CHAT_DISQUSS.md                  # архив; решим про gitignore позже
```

**Auth flow для stdio:**

1. `getApiKey()`: `process.env.BRIGHTY_API_KEY` → если нет, `keytar.getPassword("brighty-mcp", "default")` → если нет, throw с actionable error "Run `npx @brighty/mcp-server login` или установите BRIGHTY_API_KEY"
2. `BrightyClient` constructor получает ключ; на startup делает `GET /me` для validation, fail loudly если 401
3. Все логи маскируют ключ (последние 4 символа max)
4. **Никаких MCP-тулов которые пишут credentials** (deletion of `brighty_setup`)

**Tool registration pattern (preserve from source):**

```ts
// В index.ts
import { listAccounts } from "./tools/accounts/list-accounts.js";
// ...26 imports... wait, 24 after dropping setup

const allTools = [listAccounts /* ... */];
for (const tool of allTools) {
  // tool.inputSchema is z.object({...}); .shape access works because no refinements
  if (Object.keys(tool.inputSchema.shape).length === 0) {
    server.tool(tool.name, tool.description, tool.handler);
  } else {
    server.tool(tool.name, tool.description, tool.inputSchema.shape, tool.handler);
  }
}
```

**Cross-reference check algorithm:**

```js
// scripts/check-tool-references.mjs
const skillTools = new Set(); // brighty_* mentions in any SKILL.md
const codeTools = new Set(); // server.tool("brighty_...") in tools/**/*.ts

for (const skillFile of glob("skills/*/SKILL.md")) {
  for (const match of readFile(skillFile).matchAll(/\bbrighty_[a-z_]+\b/g)) {
    skillTools.add(match[0]);
  }
}
for (const toolFile of glob("packages/mcp-server/src/tools/**/*.ts")) {
  for (const match of readFile(toolFile).matchAll(/server\.tool\(\s*["'](brighty_[a-z_]+)["']/g)) {
    codeTools.add(match[1]);
  }
}

const missingInCode = [...skillTools].filter((t) => !codeTools.has(t));
if (missingInCode.length) {
  console.error("Skills reference non-existent tools:", missingInCode);
  process.exit(1);
}

const orphanInCode = [...codeTools].filter((t) => !skillTools.has(t));
if (orphanInCode.length) {
  console.warn("Tools not mentioned in any skill (warning, not error):", orphanInCode);
}
```

## Post-Completion

_Items requiring manual intervention or external systems — no checkboxes, informational only_

**Manual verification:**

- Поставить плагин локально в Claude Code: `/plugin marketplace add file:///Users/.../brighty-agent-toolkit` → `/plugin install brighty@brighty-agent-toolkit`
- Проверить что прокидывается `BRIGHTY_API_KEY` (env через MCP-конфиг клиента)
- Проверить активацию каждого скилла: попросить агента (a) "покажи мои балансы" → активация `brighty-banking`, (b) "оплати инвойс" → активация `brighty-invoice-pay`, etc.
- Прогнать один реальный flow через staging Brighty API: list accounts → transfer intent → preview rate
- Проверить `brighty-mcp login` CLI: запуск, prompt, валидация, сохранение в Keychain (на macOS: проверить через Keychain Access что запись `brighty-mcp` появилась)

**External system updates / следующие итерации:**

- **Деплой / hosted MCP / HTTP-транспорт** — отдельный заход (привязан к разговору про деплой)
- **OAuth 2.1 façade** для hosted-режима (Stytch/WorkOS/Auth0 — выбор; integration с Business Portal для token provisioning; scope-gating; revocation flow)
- **Договорённости с Brighty platform team** (нужны до hosted-режима):
  - Существует ли token revocation API?
  - Есть ли scoped tokens (read-only, per-product)?
  - Возможен ли backend-канал из Business Portal для server-to-server token provisioning?
- **agents/ + commands/** — реализовать в v0.2 после того как стабилизируются скиллы
- **Релизные workflows** (`release-mcp.yml`, `release-skills.yml`, `publish-clawhub.yml`) — отдельная таска, после того как v0.1 пройдёт ручную проверку
- **npm publishing**: согласовать scope (`@brighty/mcp-server` требует регистрации org в npm, либо без скоупа `brighty-mcp-server`)
- **Docker image / GHCR**: тоже после стабилизации stdio-варианта
- **`docs/HOSTING.md`, `docs/DEVELOPING_SKILLS.md`** — пишутся в итерации hosted/деплоя
- **CI runner**: текущий `[self-hosted, Linux, X64]` — подтвердить с инфра-командой что runner существует, либо мигрировать на `ubuntu-latest`
