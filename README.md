# marusya

Удалённый MCP-сервер на Cloudflare Workers.

## Инструменты

- `hello` — проверка подключения.
- `topvisor_list_projects` — список проектов Topvisor (нужны `TOPVISOR_USER_ID` и Secret `TOPVISOR_API_KEY`).
- `bukvarix_keyword_search` — поиск по одной фразе в Bukvarix.
- `bukvarix_multi_keyword_search` — поиск по списку фраз в Bukvarix.
- `prcy_*` — динамический прокси инструментов официального PR-CY MCP (требует Secret `PRCY_API_KEY`).

Bukvarix по умолчанию использует бесплатный API (`api_key=free`). Платный ключ можно задать как Secret `BUKVARIX_API_KEY`.

Успешные ответы Topvisor и Bukvarix сохраняются в D1 (`codex-mcp-data`) в таблице `api_query_history`. Сохраняются параметры запроса и до 50 000 символов ответа; записи не удаляются автоматически.
Ответы PR-CY также сохраняются в эту таблицу.

## Разработка

```powershell
npm.cmd install
npm.cmd run dev
```

Локальная точка подключения MCP: `http://localhost:8787/mcp`.

Для локального Topvisor задайте `TOPVISOR_API_KEY` в `.dev.vars` и не добавляйте этот файл в Git.

## Деплой

```powershell
npm.cmd run deploy
```

После публикации Worker доступен по адресу:
`https://codex-mcp-worker.margeran.workers.dev/mcp`.

## Подключение к Codex

```powershell
codex mcp add my-mcp --url https://codex-mcp-worker.margeran.workers.dev/mcp
codex mcp list
```
