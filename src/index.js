import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

function createServer(env) {
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
      return responseToolResult(response, "Topvisor");
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
      return responseToolResult(await fetch(url), "Bukvarix");
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
      );
    },
  );

  return server;
}

function toolError(message) {
  return { isError: true, content: [{ type: "text", text: message }] };
}

async function responseToolResult(response, service) {
  const text = await response.text();
  if (!response.ok) {
    return toolError(`${service} вернул HTTP ${response.status}: ${text.slice(0, 1500)}`);
  }
  return { content: [{ type: "text", text: text.slice(0, 20000) }] };
}

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(createServer(env))(request, env, ctx);
  },
};
