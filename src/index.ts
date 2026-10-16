#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, AdsConfig } from "./config.js";
import { createServer } from "./server.js";
import { startHttpServer } from "./http.js";

async function main() {
  // MCP_TRANSPORT=http: multi-tenant Streamable HTTP (credentials per request, see http.ts).
  if (process.env.MCP_TRANSPORT === "http") {
    await startHttpServer(process.env);
    return;
  }
  const server = createServer(loadConfig());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

// ── Smithery Sandbox ──

export function createSandboxServer() {
  const mockConfig: AdsConfig = {
    accessToken: "",
    adAccountId: "",
    appId: "",
    appSecret: "",
    businessId: "",
    pixelId: "",
  };
  return createServer(mockConfig);
}
