import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

async function connected(fetched: string[]) {
  const server = createServer({
    accessToken: "dummy",
    adAccountId: "act_1",
    appId: "",
    appSecret: "",
    businessId: "",
    pixelId: "",
    graphApiBase: "http://127.0.0.1:9",
  });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    fetched.push(String(url));
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { client, restore: () => (globalThis.fetch = real) };
}

test("an argument a tool does not take is an error, never dropped (no call to Graph)", async () => {
  const fetched: string[] = [];
  const { client, restore } = await connected(fetched);
  try {
    const r = await client.callTool({ name: "list_campaigns", arguments: { ad_account_id: "act_2" } });
    assert.equal(r.isError, true);
    assert.match(JSON.stringify(r.content), /ad_account_id/);
    assert.deepEqual(fetched, []);
  } finally {
    restore();
    await client.close();
  }
});

test("the arguments a tool takes still run", async () => {
  const fetched: string[] = [];
  const { client, restore } = await connected(fetched);
  try {
    const r = await client.callTool({ name: "list_campaigns", arguments: { account_id: "act_2" } });
    assert.notEqual(r.isError, true);
    assert.equal(fetched.length, 1);
    assert.match(fetched[0] ?? "", /act_2\/campaigns/);
  } finally {
    restore();
    await client.close();
  }
});
