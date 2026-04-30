# Release plan — `@brighty-app/mcp-server@0.0.1`

Step-by-step to ship the first npm version with provenance.

## Status снэпшот

- ✅ Код на ветке `chore/v0.1-release-prep` (PR ready), запушен на GitHub
- ✅ npm org `brighty-app` создана
- ✅ Версия 0.0.1 во всех 8 местах согласованы
- ✅ keytar заменён на `@napi-rs/keyring` (prebuilds для всех платформ)
- ✅ 120/120 тестов + 3 валидатора зелёные локально
- ⏳ Ветка не смерджена в master
- ⏳ Первый publish не сделан
- ⏳ Trusted publisher не настроен
- ⏳ `release-mcp.yml` workflow не написан

---

## Шаг 0 — Слияние ветки в master

Вариант А (через GitHub UI): открыть PR https://github.com/razz-team/brighty-agent-toolkit/pull/new/chore/v0.1-release-prep → review → squash-merge в master.

Вариант B (локально fast-forward, если PR-флоу пока не нужен):

```bash
git checkout master
git merge --ff-only chore/v0.1-release-prep
git push origin master
```

Дальше работаем из master. Проверить:

```bash
git log --oneline -3              # должен быть наш коммит 6e263c5 наверху
git status                        # clean
```

---

## Шаг 1 — Подтвердить владение scope

1. Открыть https://www.npmjs.com/settings/brighty-app/packages
2. Должен быть пустой список пакетов (никто ещё ничего не публиковал в scope)
3. Settings → Members — убедиться что бэкап-аккаунт добавлен (bus factor)
4. Settings → Default Package Visibility = Public
5. Settings → Two-Factor Authentication for the org = enforced

Если что-то не так на этом шаге — стопаемся, чиним до публикации.

---

## Шаг 2 — Локальный npm login

```bash
npm login                          # откроет браузер, OAuth-flow с 2FA
npm whoami                         # должно вернуть твой npm username
npm org ls brighty-app             # должно показать тебя как owner
```

Если в `~/.npmrc` уже что-то лежит (например, GitHub Packages auth от xyz-web) — `npm login` добавит токен npmjs.org поверх, не сломает.

---

## Шаг 3 — Первый publish (manual, без provenance)

> **Почему manual.** npm trusted publisher (OIDC) не разрешает первую публикацию в несуществующий пакет — нужно сначала "застолбить" имя. Provenance тоже нельзя сделать локально (требует CI environment). После этого шага все следующие версии пойдут через workflow с provenance.

```bash
cd packages/mcp-server

# Свежий билд:
yarn build

# Dry-run — посмотреть что попадёт в тарбол:
npm publish --dry-run --access public

# Проверить вывод:
# - Должны быть только dist/ и README.md (per "files" в package.json)
# - НЕ должно быть src/, test/, .env, node_modules/
# - Total size — ~100-200KB ожидаемо

# Если всё ок — реальная публикация:
npm publish --access public
# (2FA OTP prompt — введи код из аутентификатора)
```

После успешного `publish`:

```bash
# Проверить что встало:
npm view @brighty-app/mcp-server
# Должно показать version 0.0.1, files, repository, license MIT
```

---

## Шаг 4 — Smoke-test свежепубликованного на чистой shell

В **новом** терминале (не том где публиковал — чтобы не было кэшированных env):

```bash
# Тест 1: бинарь стартует, проваливается с понятной ошибкой:
npx -y -p @brighty-app/mcp-server@0.0.1 brighty-mcp
# Ожидаемо: "[brighty-mcp] Brighty API key not found. Set the BRIGHTY_API_KEY..."
# (это правильное поведение — нет ключа → exit 1)

# Тест 2: с фейковым ключом — должен валидироваться против /me:
BRIGHTY_API_KEY=fake_key_smoke_test npx -y -p @brighty-app/mcp-server@0.0.1 brighty-mcp
# Ожидаемо: "[brighty-mcp] startup auth failed: Brighty API rejected the API key (key ***test, HTTP 401)"
# (это значит: пакет загрузился, нативная либа keychain загрузилась, http клиент работает)

# Тест 3: с реальным ключом — auth OK:
BRIGHTY_API_KEY=<real_key_from_business_portal> npx -y -p @brighty-app/mcp-server@0.0.1 brighty-mcp
# Ожидаемо: "[brighty-mcp] auth OK (key ***xxxx)" — потом сервер ждёт stdio
# Прервать Ctrl+C
```

Если что-то из этого падает с `Error: Cannot find module ...` или `node-gyp rebuild` — проблема с prebuilds `@napi-rs/keyring`. Стопаемся, разбираемся до того как идти дальше.

---

## Шаг 5 — Настройка trusted publisher

1. Открыть https://www.npmjs.com/package/@brighty-app/mcp-server/access
2. Tab **"Trusted Publishers"** → **"Add trusted publisher"** → выбрать **GitHub Actions**
3. Заполнить ровно так:
   - **Repository owner:** `razz-team`
   - **Repository name:** `brighty-agent-toolkit`
   - **Workflow filename:** `release-mcp.yml`
   - **Environment name:** оставить пустым
4. Save

После этого все publish из этого workflow пойдут с короткоживущим OIDC-токеном — никаких NPM_TOKEN в репо.

---

## Шаг 6 — Написать release-mcp.yml (под self-hosted runners)

Файл `.github/workflows/release-mcp.yml`:

```yaml
name: release-mcp

on:
  push:
    tags:
      - 'mcp-server-v*'

defaults:
  run:
    shell: bash

permissions:
  contents: write     # для GitHub Release
  id-token: write     # для npm OIDC + provenance
  packages: read

jobs:
  publish:
    runs-on: [self-hosted, Linux, X64, large]
    env:
      NPM_GITHUB_TOKEN: you-dont-need-this
      CI: true
    steps:
      - name: checkout
        uses: actions/checkout@v6

      - name: update .yarnrc.yml for GitHub Packages auth
        run: |
          yarn config set 'npmRegistries["//npm.pkg.github.com"].npmAuthToken' '${NPM_GITHUB_TOKEN}'

      - name: install
        run: yarn install --immutable
        env:
          NPM_GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: verify tag matches package version
        run: |
          PKG_VERSION=$(node -p "require('./packages/mcp-server/package.json').version")
          TAG_VERSION="${GITHUB_REF_NAME#mcp-server-v}"
          if [ "$PKG_VERSION" != "$TAG_VERSION" ]; then
            echo "Tag $TAG_VERSION does not match package version $PKG_VERSION"
            exit 1
          fi

      - name: build
        run: yarn workspace @brighty-app/mcp-server build

      - name: test
        run: yarn workspace @brighty-app/mcp-server test

      - name: publish to npm
        run: npm publish --provenance --access public
        working-directory: packages/mcp-server

      - name: create github release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "${GITHUB_REF_NAME}" \
            --title "${GITHUB_REF_NAME}" \
            --generate-notes
```

Закоммитить в master отдельным коммитом (после того как ветка `chore/v0.1-release-prep` смерджена).

---

## Шаг 7 — End-to-end тест release pipeline (опционально, делать на 0.0.2)

После того как 0.0.1 уже опубликован вручную и trusted publisher настроен, проверить что workflow реально работает — на следующей версии:

```bash
# Bump до 0.0.2:
# - packages/mcp-server/package.json: 0.0.1 → 0.0.2
# - .mcp.json: @0.0.1 → @0.0.2
# - packages/mcp-server/src/index.ts: SERVER_VERSION
# - .claude-plugin/plugin.json
# - package.json (root)
# - 4× SKILL.md frontmatter (если хотим алайнить)
# - README install commands

git add -A && git commit -m "chore: release 0.0.2"
git push origin master

# Поставить тег:
git tag mcp-server-v0.0.2
git push origin mcp-server-v0.0.2
```

После этого:
1. GitHub Actions запустит `release-mcp.yml`
2. Workflow собирает, тестирует, публикует с provenance
3. Создаёт GitHub Release
4. На странице пакета https://www.npmjs.com/package/@brighty-app/mcp-server должен появиться **зелёный значок Provenance**

Этот шаг — валидация что pipeline работает. До этого не считать релиз-инфраструктуру готовой.

---

## Шаг 8 — Marketplace test (Claude Code)

После того как npm-пакет 0.0.1 живой:

```
/plugin marketplace add razz-team/brighty-agent-toolkit
/plugin install brighty@brighty-agent-toolkit
```

Затем:
- Установить `BRIGHTY_API_KEY` в env Claude Desktop / Claude Code
- Перезапустить клиент
- Спросить агента: "list my brighty accounts" — должен вызвать `brighty_list_accounts`

Если работает — это и есть рабочая инсталляция через marketplace. На сайте brighty.app/en/business/agents можно показывать ровно эти две команды.

---

## Failure modes

| Симптом | Причина | Фикс |
|---|---|---|
| `npm ERR! 404 scope not found` | npm login не сделан или не тот аккаунт | `npm whoami`, перелогин |
| `npm ERR! 403 You do not have permission` | scope `brighty-app` принадлежит другому аккаунту | проверить org membership |
| `npm ERR! OTP required` | 2FA enforced — это правильно | ввести код из аутентификатора |
| Публикация прошла но `npm view` 404 | npm propagation, иногда минуту | подождать ~60s |
| `npx` падает с `Cannot find module @napi-rs/keyring-darwin-arm64` | prebuild для платформы не докачался | `npm cache clean --force`, повторить |
| `npm ERR! E422 too similar to existing` | spam-detection (мы используем @brighty-app — не должно бить) | если бьёт — пинговать npm support |

---

## Rollback

В первые 72 часа можно `unpublish`:

```bash
npm unpublish @brighty-app/mcp-server@0.0.1
```

После 72 часов — только deprecate:

```bash
npm deprecate @brighty-app/mcp-server@0.0.1 "Use @brighty-app/mcp-server@0.0.2"
```

---

## Чеклист итогом

```
□ Шаг 0  — ветка смерджена в master
□ Шаг 1  — npm org brighty-app проверена
□ Шаг 2  — npm login + whoami локально
□ Шаг 3  — npm publish 0.0.1 (manual, без provenance)
□ Шаг 4  — npx-smoke на чистой shell, 3 кейса
□ Шаг 5  — trusted publisher настроен на github actions
□ Шаг 6  — release-mcp.yml в master
□ Шаг 7  — bump 0.0.2 + tag → workflow → provenance badge
□ Шаг 8  — marketplace install test in Claude Code
```

Шаги 0–4 — это и есть выкатка 0.0.1. Шаги 5–8 — настройка инфраструктуры на следующие релизы.
