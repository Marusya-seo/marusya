# marusya

Удалённый MCP-сервер на Cloudflare Workers. Сейчас доступен инструмент `hello`; здесь можно добавлять инструменты для вызова внешних API.

## Разработка

```powershell
npm.cmd install
npm.cmd run dev
```

Локальная точка подключения MCP: `http://localhost:8787/mcp`.

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
