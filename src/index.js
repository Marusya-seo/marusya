import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

function createServer() {
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

  return server;
}

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(createServer())(request, env, ctx);
  },
};
