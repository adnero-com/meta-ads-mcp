import test from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AdsClient } from "../src/services/ads-client.js";
import { registerCampaignTools } from "../src/tools/campaigns.js";
import { registerAdsetTools } from "../src/tools/adsets.js";
import { registerAdTools } from "../src/tools/ads.js";
import { DEFAULT_AD_FIELDS, DEFAULT_ADSET_FIELDS, DEFAULT_CAMPAIGN_FIELDS } from "../src/default-fields.js";

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
  registerCampaignTools(server, client);
  registerAdsetTools(server, client);
  registerAdTools(server, client);
  return { handlers, sent };
}

const cases: ReadonlyArray<readonly [string, Record<string, unknown>, string]> = [
  ["list_campaigns", {}, DEFAULT_CAMPAIGN_FIELDS],
  ["list_adsets", {}, DEFAULT_ADSET_FIELDS],
  ["list_ads", {}, DEFAULT_AD_FIELDS],
  ["get_campaign_adsets", { campaign_id: "1" }, DEFAULT_ADSET_FIELDS],
  ["get_campaign_ads", { campaign_id: "1" }, DEFAULT_AD_FIELDS],
  ["get_adset_ads", { adset_id: "2" }, DEFAULT_AD_FIELDS],
];

for (const [tool, args, defaults] of cases) {
  test(`${tool} sends default fields when omitted`, async () => {
    const { handlers, sent } = setup();
    await handlers.get(tool)!(args);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].params.fields, defaults);
  });

  test(`${tool} sends the caller's fields when given`, async () => {
    const { handlers, sent } = setup();
    await handlers.get(tool)!({ ...args, fields: "id,name" });
    assert.equal(sent[0].params.fields, "id,name");
  });
}

test("default field lists start with id and carry the spec'd columns", () => {
  assert.ok(DEFAULT_CAMPAIGN_FIELDS.startsWith("id,name,status,effective_status,objective"));
  assert.ok(DEFAULT_ADSET_FIELDS.includes("optimization_goal,billing_event"));
  assert.ok(DEFAULT_AD_FIELDS.includes("creative{id,name}"));
});
