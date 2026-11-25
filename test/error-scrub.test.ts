import test from "node:test";
import assert from "node:assert/strict";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createHttpHandler } from "../src/http.js";
import { UNCHECKED_ERROR_MESSAGE, scrubbedMessage, scrubbing } from "../src/error-scrub.js";

const TOKEN = "EAAGmetaErrorTokenL1k2j3h4g5f6";
const msg = (m: unknown): JSONRPCMessage => m as JSONRPCMessage;

test("error-scrub: a JSON-RPC error loses its credential, keeps its id, code and the rest of the URL", () => {
  const out = scrubbedMessage(
    msg({
      jsonrpc: "2.0",
      id: 4,
      error: {
        code: -32602,
        message: `Graph: https://graph.facebook.com/v26.0/act_1/ads?access_token=${TOKEN}&limit=5`,
        data: { access_token: TOKEN, url: `https://x.example/?appsecret_proof=${TOKEN}` },
      },
    }),
  );
  assert.ok(!JSON.stringify(out).includes(TOKEN));
  assert.deepEqual(out, {
    jsonrpc: "2.0",
    id: 4,
    error: { code: -32602, message: "Graph: https://graph.facebook.com/v26.0/act_1/ads?limit=5", data: { url: "https://x.example/" } },
  });
});

test("error-scrub: a clean error and a result are sent as they are (the same object)", () => {
  const clean = msg({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } });
  const result = msg({ jsonrpc: "2.0", id: 2, result: { content: [] } });
  assert.equal(scrubbedMessage(clean), clean);
  assert.equal(scrubbedMessage(result), result);
});

test("error-scrub: fails closed on an error it cannot check", () => {
  const deep = Array.from({ length: 100 }).reduce<unknown>((acc) => ({ inner: acc }), "x");
  assert.deepEqual(scrubbedMessage(msg({ jsonrpc: "2.0", id: "z", error: { code: -1, message: "m", data: deep } })), {
    jsonrpc: "2.0",
    id: "z",
    error: { code: -32603, message: UNCHECKED_ERROR_MESSAGE },
  });
});

test("error-scrub: scrubbing passes the options through", async () => {
  const calls: Array<[JSONRPCMessage, unknown]> = [];
  const t = scrubbing({ send: async (m: JSONRPCMessage, o?: unknown) => void calls.push([m, o]) });
  await t.send(msg({ jsonrpc: "2.0", id: 3, error: { code: -1, message: `?access_token=${TOKEN}` } }), { relatedRequestId: 3 });
  assert.ok(!JSON.stringify(calls[0]?.[0]).includes(TOKEN));
  assert.deepEqual(calls[0]?.[1], { relatedRequestId: 3 });
});

test("http: an error answer that echoes a token is scrubbed before it leaves", async (t) => {
  const handler = createHttpHandler({ sharedSecret: "gw-key-123456", graphApiBase: "http://127.0.0.1:9/v26.0" });
  const server: Server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { "x-meta-mcp-key": "gw-key-123456", "x-meta-access-token": "tokenA", "x-meta-ad-account-id": "act_1" } },
    }),
  );
  t.after(() => client.close());
  // An unknown prompt: the SDK answers a JSON-RPC error whose message echoes the name it was given.
  const failed = await client.getPrompt({ name: `https://graph.facebook.com/x?access_token=${TOKEN}` }).then(
    () => "no error",
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  );
  assert.notEqual(failed, "no error");
  assert.match(failed, /graph\.facebook\.com\/x/);
  assert.ok(!failed.includes(TOKEN), failed);
});
