import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

async function createServer(env) {
  const server = new McpServer({
    name: "codex-mcp-worker",
    version: "0.1.0",
  });

  server.registerTool(
    "hello",
    {
      description: "Проверяет, что MCP-сервер доступен.",
      inputSchema: { name: z.string().optional() },
    },
    async ({ name }) => ({
      content: [{ type: "text", text: `Привет, ${name ?? "мир"}! MCP-сервер работает.` }],
    }),
  );

  server.registerTool(
    "prcy_connection_status",
    {
      description: "Показывает, настроен ли доступ к PR-CY MCP; значение ключа не раскрывает.",
    },
    async () => ({
      content: [{
        type: "text",
        text: env.PRCY_API_KEY
          ? "Секрет PRCY_API_KEY доступен Worker."
          : "Нет секрета PRCY_API_KEY в настройках Worker.",
      }],
    }),
  );

  if (env.PRCY_API_KEY) {
    await registerPrCyTools(server, env).catch((error) => {
      console.error("PR-CY tool discovery failed:", error);
    });
  }

  server.registerTool(
    "topvisor_list_projects",
    {
      description: "Получает список проектов аккаунта Topvisor.",
      inputSchema: {
        limit: z.number().int().min(1).max(1000).optional(),
        includeSummary: z.boolean().optional(),
      },
    },
    async ({ limit = 100, includeSummary = false }) => {
      if (!env.TOPVISOR_API_KEY || !env.TOPVISOR_USER_ID) {
        return toolError("Topvisor не настроен: добавьте TOPVISOR_API_KEY и TOPVISOR_USER_ID в Cloudflare.");
      }

      const response = await fetch("https://api.topvisor.com/v2/json/get/projects_2/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Id": env.TOPVISOR_USER_ID,
          Authorization: `bearer ${env.TOPVISOR_API_KEY}`,
        },
        body: JSON.stringify({
          limit,
          fields: ["id", "name", "url"],
          ...(includeSummary ? { include_positions_summary: 1 } : {}),
        }),
      });
      return responseToolResult(response, "Topvisor", env, "topvisor_list_projects", { limit, includeSummary });
    },
  );

  server.registerTool(
    "bukvarix_keyword_search",
    {
      description: "Ищет связанные поисковые фразы в Bukvarix по одной фразе.",
      inputSchema: {
        query: z.string().min(1).max(500),
        limit: z.number().int().min(1).max(10000).optional(),
      },
    },
    async ({ query, limit = 250 }) => {
      const url = new URL("http://api.bukvarix.com/v1/keywords/");
      url.search = new URLSearchParams({
        q: query,
        api_key: env.BUKVARIX_API_KEY || "free",
        num: String(limit),
        format: "json",
        json_type: "array",
      }).toString();
      return responseToolResult(await fetch(url), "Bukvarix", env, "bukvarix_keyword_search", { query, limit });
    },
  );

  server.registerTool(
    "bukvarix_multi_keyword_search",
    {
      description: "Ищет связанные фразы в Bukvarix по списку поисковых фраз.",
      inputSchema: {
        queries: z.array(z.string().min(1).max(500)).min(1).max(100),
        exclude: z.array(z.string().min(1).max(500)).max(250).optional(),
        limit: z.number().int().min(1).max(10000).optional(),
      },
    },
    async ({ queries, exclude = [], limit = 250 }) => {
      const body = new URLSearchParams({
        q: queries.join("\r\n"),
        api_key: env.BUKVARIX_API_KEY || "free",
        num: String(limit),
        format: "json",
        json_type: "array",
      });
      if (exclude.length) body.set("q2", exclude.join("\r\n"));

      return responseToolResult(
        await fetch("http://api.bukvarix.com/v1/mkeywords/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        }),
        "Bukvarix",
        env,
        "bukvarix_multi_keyword_search",
        { queries, exclude, limit },
      );
    },
  );

  return server;
}

async function registerPrCyTools(server, env) {
  const tools = await withPrCyClient(env, (client) => client.listTools());
  for (const tool of tools.tools ?? []) {
    const exposedName = `prcy_${tool.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50)}`;
    const schemaDescription = tool.inputSchema
      ? `\nInput JSON Schema: ${JSON.stringify(tool.inputSchema)}`
      : "";
    server.registerTool(
      exposedName,
      {
        description: `${tool.description || tool.name}${schemaDescription}`,
        inputSchema: { arguments: z.record(z.string(), z.unknown()).optional() },
      },
      async ({ arguments: args = {} }) => {
        const result = await withPrCyClient(env, (client) =>
          client.callTool({ name: tool.name, arguments: args }),
        );
        const serialized = JSON.stringify(result);
        await saveHistory(env, "PR-CY", exposedName, args, serialized);
        return {
          content: [{ type: "text", text: serialized.slice(0, 20000) }],
          ...(result.isError ? { isError: true } : {}),
        };
      },
    );
  }
}

async function withPrCyClient(env, action) {
  if (!env.PRCY_API_KEY) throw new Error("PRCY_API_KEY is not configured");
  const client = new Client({ name: "codex-mcp-worker", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL("https://mcp-server.pr-cy.ru/mcp/"),
    { requestInit: { headers: { Authorization: `Bearer ${env.PRCY_API_KEY}` } } },
  );
  await client.connect(transport);
  try {
    return await action(client);
  } finally {
    await client.close();
  }
}

function toolError(message) {
  return { isError: true, content: [{ type: "text", text: message }] };
}

async function responseToolResult(response, service, env, toolName, params) {
  const text = await response.text();
  if (!response.ok) {
    return toolError(`${service} вернул HTTP ${response.status}: ${text.slice(0, 1500)}`);
  }

  await saveHistory(env, service, toolName, params, text);

  return {
    content: [{
      type: "text",
      text: `${text.slice(0, 20000)}${text.length > 20000 ? "\n\n[Ответ сокращён для чата; в D1 сохранено до 50 000 символов.]" : ""}`,
    }],
  };
}

async function saveHistory(env, service, toolName, params, result) {
  const storedText = String(result).slice(0, 50000);
  try {
    await env.DB.prepare(
      "INSERT INTO api_query_history (provider, tool_name, params_json, result_json, truncated) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(service, toolName, JSON.stringify(params), storedText, Number(String(result).length > storedText.length))
      .run();
  } catch (error) {
    console.error("D1 history write failed:", error);
  }
}

export default {
  async fetch(request, env, ctx) {
    return createMcpHandler(await createServer(env))(request, env, ctx);
  },
};
