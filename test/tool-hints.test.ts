import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { READ_ONLY_TOOLS, hintsFor } from "../src/tool-hints.js";

async function listTools() {
  const server = createServer({
    accessToken: "dummy",
    adAccountId: "act_1",
    appId: "",
    appSecret: "",
    businessId: "",
    pixelId: "",
  });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const { tools } = await client.listTools();
  await client.close();
  return tools;
}

type JsonSchema = { type?: string; enum?: unknown[]; required?: string[]; properties?: Record<string, JsonSchema>; items?: JsonSchema };

/** Minimal valid value for a schema: ids "123", enums take their first member. */
function sample(schema: JsonSchema | undefined): unknown {
  if (!schema) return "123";
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  switch (schema.type) {
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return "123";
  }
}

function minimalArgs(schema: JsonSchema): Record<string, unknown> {
  const props = schema.properties ?? {};
  return Object.fromEntries((schema.required ?? []).map((k) => [k, sample(props[k])]));
}

test("every read-only tool only issues GET requests", async () => {
  const seen: Array<{ method: string; url: string }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { method?: string }) => {
    seen.push({ method: (init?.method ?? "GET").toUpperCase(), url: String(input) });
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const server = createServer({
      accessToken: "dummy",
      adAccountId: "act_1",
      appId: "",
      appSecret: "",
      businessId: "b1",
      pixelId: "",
    });
    const client = new Client({ name: "test", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const { tools } = await client.listTools();
    const readTools = tools.filter((t) => READ_ONLY_TOOLS.has(t.name));
    assert.equal(readTools.length, READ_ONLY_TOOLS.size);
    for (const tool of readTools) {
      seen.length = 0;
      await client.callTool({ name: tool.name, arguments: minimalArgs(tool.inputSchema as JsonSchema) });
      assert.ok(seen.length > 0, `${tool.name} made no request (arguments rejected?)`);
      const bad = seen.filter((r) => r.method !== "GET");
      assert.deepEqual(bad, [], `${tool.name} issued a non-GET request`);
    }
    await client.close();
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("every registered tool carries annotations", async () => {
  const tools = await listTools();
  assert.ok(tools.length > 100);
  for (const t of tools) {
    assert.deepEqual(t.annotations, hintsFor(t.name), t.name);
    assert.equal(t.annotations?.openWorldHint, true, t.name);
  }
});

test("every read-only name is a registered tool, and only those are read-only", async () => {
  const tools = await listTools();
  const names = new Set(tools.map((t) => t.name));
  for (const n of READ_ONLY_TOOLS) assert.ok(names.has(n), `${n} is not registered`);
  const flagged = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
  assert.deepEqual(flagged.sort(), [...READ_ONLY_TOOLS].sort());
});

test("no write-looking tool is read-only", async () => {
  const tools = await listTools();
  const writes = /^(create|update|delete|copy|upload|add|remove|send|exchange|refresh|batch)_/;
  for (const t of tools.filter((x) => writes.test(x.name))) {
    assert.equal(t.annotations?.readOnlyHint, false, t.name);
  }
});

test("destructive hint: deletes, removals and delivery-changing updates; not creates", async () => {
  const tools = await listTools();
  const hint = (n: string) => tools.find((t) => t.name === n)?.annotations;
  for (const n of tools.map((t) => t.name).filter((n) => n.startsWith("delete_"))) {
    assert.equal(hint(n)?.destructiveHint, true, n);
  }
  for (const n of ["update_campaign", "update_adset", "update_ad", "update_ad_account", "remove_users_from_audience"]) {
    assert.equal(hint(n)?.destructiveHint, true, n);
  }
  for (const n of ["create_campaign", "copy_ad", "upload_image"]) {
    assert.equal(hint(n)?.destructiveHint, false, n);
  }
  for (const n of READ_ONLY_TOOLS) {
    assert.deepEqual(hint(n), {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  }
});
