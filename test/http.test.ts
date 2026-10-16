import test from "node:test";
import assert from "node:assert/strict";
import { createServer, IncomingMessage, Server } from "node:http";
import { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpHandler } from "../src/http.js";

type Seen = { path: string; token: string | null; proof: string | null };

/** A fake Graph: answers every GET with which token asked, after a delay that interleaves requests. */
const fakeGraph = async () => {
  const seen: Seen[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    const url = new URL(req.url ?? "/", "http://graph");
    const token = url.searchParams.get("access_token");
    seen.push({ path: url.pathname, token, proof: url.searchParams.get("appsecret_proof") });
    const delay = token?.endsWith("A") ? 40 : 5;
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: `campaign-of-${token?.slice(-1)}`, path: url.pathname }] }));
    }, delay);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { seen, server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v26.0` };
};

const listen = async (handler: ReturnType<typeof createHttpHandler>): Promise<{ server: Server; url: string }> => {
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
};

const connect = async (url: string, headers: Record<string, string>) => {
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers } }));
  return client;
};

const textOf = (r: unknown): string => ((r as { content: Array<{ text: string }> }).content[0]?.text ?? "");

test("http: each request uses only its own token and ad account, concurrently", async (t) => {
  const graph = await fakeGraph();
  const mcp = await listen(createHttpHandler({ sharedSecret: "gw-key-123456", graphApiBase: graph.base }));
  t.after(() => {
    graph.server.close();
    mcp.server.close();
  });
  const a = await connect(mcp.url, { "x-meta-mcp-key": "gw-key-123456", "x-meta-access-token": "tokenA", "x-meta-ad-account-id": "act_111" });
  const b = await connect(mcp.url, {
    "x-meta-mcp-key": "gw-key-123456",
    "x-meta-access-token": "tokenB",
    "x-meta-ad-account-id": "act_222",
    "x-meta-appsecret-proof": "proofB",
  });
  const [ra, rb] = await Promise.all([
    a.callTool({ name: "list_campaigns", arguments: {} }),
    b.callTool({ name: "list_campaigns", arguments: {} }),
  ]);
  assert.match(textOf(ra), /campaign-of-A/);
  assert.match(textOf(ra), /act_111/);
  assert.match(textOf(rb), /campaign-of-B/);
  assert.match(textOf(rb), /act_222/);
  const calls = graph.seen.filter((s) => s.path.endsWith("/campaigns"));
  assert.deepEqual(
    calls.map((s) => [s.path, s.token, s.proof]).sort(),
    [
      ["/v26.0/act_111/campaigns", "tokenA", null],
      ["/v26.0/act_222/campaigns", "tokenB", "proofB"],
    ]
  );
  await a.close();
  await b.close();
});

test("http: tools are listed through the HTTP transport", async (t) => {
  const mcp = await listen(createHttpHandler({}));
  t.after(() => mcp.server.close());
  const c = await connect(mcp.url, { "x-meta-access-token": "tokenA" });
  const { tools } = await c.listTools();
  assert.ok(tools.length > 100);
  assert.ok(tools.some((tool) => tool.name === "get_insights" || tool.name === "get_account_insights"));
  await c.close();
});

test("http: without the gateway key or a token the answer is 401 and never echoes a header", async (t) => {
  const mcp = await listen(createHttpHandler({ sharedSecret: "gw-key-123456" }));
  t.after(() => mcp.server.close());
  const post = (headers: Record<string, string>) =>
    fetch(`${mcp.url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
  const noKey = await post({ "x-meta-access-token": "secret-token-zzz" });
  assert.equal(noKey.status, 401);
  assert.ok(!(await noKey.text()).includes("secret-token-zzz"));
  const noToken = await post({ "x-meta-mcp-key": "gw-key-123456" });
  assert.equal(noToken.status, 401);
});

test("http: /healthz answers without credentials, GET /mcp is 405", async (t) => {
  const mcp = await listen(createHttpHandler({ sharedSecret: "gw-key-123456" }));
  t.after(() => mcp.server.close());
  const h = await fetch(`${mcp.url}/healthz`);
  assert.equal(h.status, 200);
  assert.deepEqual(await h.json(), { status: "ok" });
  assert.equal((await fetch(`${mcp.url}/mcp`)).status, 405);
});
