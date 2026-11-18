import test from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AdsClient } from "../src/services/ads-client.js";
import { registerAdsetTools } from "../src/tools/adsets.js";
import { registerAdTools } from "../src/tools/ads.js";
import { parentFiltering } from "../src/edge-filter.js";

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

function setup() {
  const handlers = new Map<string, Handler>();
  const server = {
    tool(name: string, _d: string, _s: unknown, handler: Handler) {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;
  const sent: Array<{ path: string; params: Record<string, unknown> }> = [];
  const client = {
    accountPath: () => "/act_1",
    async get(path: string, params: Record<string, unknown>) {
      sent.push({ path, params });
      return { data: { data: [] } };
    },
  } as unknown as AdsClient;
  registerAdsetTools(server, client);
  registerAdTools(server, client);
  return { handlers, sent };
}

test("list_adsets with a campaign filters the edge by campaign.id (a plain campaign_id param is ignored by Graph)", async () => {
  const { handlers, sent } = setup();
  await handlers.get("list_adsets")!({ campaign_id: "120211", limit: 5 });
  assert.equal(sent[0]!.path, "/act_1/adsets");
  assert.equal(sent[0]!.params.campaign_id, undefined);
  assert.deepEqual(JSON.parse(String(sent[0]!.params.filtering)), [
    { field: "campaign.id", operator: "IN", value: ["120211"] },
  ]);
});

test("list_adsets without a campaign sends no filtering", async () => {
  const { handlers, sent } = setup();
  await handlers.get("list_adsets")!({});
  assert.equal(sent[0]!.params.filtering, undefined);
});

test("list_ads filters by campaign and ad set together", async () => {
  const { handlers, sent } = setup();
  await handlers.get("list_ads")!({ campaign_id: "1", adset_id: "2" });
  assert.equal(sent[0]!.params.campaign_id, undefined);
  assert.equal(sent[0]!.params.adset_id, undefined);
  assert.deepEqual(JSON.parse(String(sent[0]!.params.filtering)), [
    { field: "campaign.id", operator: "IN", value: ["1"] },
    { field: "adset.id", operator: "IN", value: ["2"] },
  ]);
});

test("parentFiltering is undefined for no parent", () => {
  assert.equal(parentFiltering({}), undefined);
});
