import { createServer as createHttpServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { tenantConfigFromHeaders } from "./tenant.js";

const MAX_BODY_BYTES = 4 * 1024 * 1024;

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

const rpcError = (code: number, message: string) => ({ jsonrpc: "2.0", id: null, error: { code, message } });

const readBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
};

export type HttpOptions = {
  /** MCP_HTTP_SHARED_SECRET: every /mcp request must carry it (x-meta-mcp-key); startHttpServer requires it. */
  sharedSecret?: string;
  /** META_GRAPH_API_BASE: the Graph base URL (a fake Graph in tests). */
  graphApiBase?: string;
};

/**
 * Stateless Streamable HTTP: one McpServer and one AdsClient per request,
 * built from that request's headers and dropped when it ends. Nothing about
 * a tenant outlives its request, and no header value is ever logged.
 */
export function createHttpHandler(opts: HttpOptions) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/healthz" && req.method === "GET") return json(res, 200, { status: "ok" });
    if (path !== "/mcp") return json(res, 404, { error: "not found" });
    if (req.method !== "POST")
      return json(res, 405, rpcError(-32000, "Method not allowed: this is a stateless endpoint, use POST."), { allow: "POST" });

    const tenant = tenantConfigFromHeaders(req.headers, opts);
    if (!tenant.ok) return json(res, tenant.status, rpcError(-32001, tenant.message));

    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 400, rpcError(-32700, "Parse error"));
    }
    const server = createServer(tenant.config);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      console.error("mcp request failed:", e instanceof Error ? e.name : "unknown");
      if (!res.headersSent) json(res, 500, rpcError(-32603, "Internal error"));
      else res.end();
    }
  };
}

export async function startHttpServer(env: NodeJS.ProcessEnv): Promise<Server> {
  const port = Number(env.PORT || 8080);
  // Required: without it anyone who can reach the port could act with any token header.
  if (!env.MCP_HTTP_SHARED_SECRET || env.MCP_HTTP_SHARED_SECRET.length < 16) {
    throw new Error("MCP_HTTP_SHARED_SECRET (16+ characters) is required in HTTP mode.");
  }
  const handler = createHttpHandler({
    sharedSecret: env.MCP_HTTP_SHARED_SECRET || undefined,
    graphApiBase: env.META_GRAPH_API_BASE || undefined,
  });
  const server = createHttpServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.error(`meta-ads-mcp: Streamable HTTP on :${port}/mcp`);
  return server;
}
