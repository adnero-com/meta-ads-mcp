import test from "node:test";
import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AdsClient } from "../src/services/ads-client.js";
import { registerCampaignTools } from "../src/tools/campaigns.js";
import { registerAdsetTools } from "../src/tools/adsets.js";
import { registerAdTools } from "../src/tools/ads.js";
import {
  ADSET_TARGETING_KEYS,
  DEFAULT_AD_FIELDS,
  DEFAULT_ADSET_DETAIL_FIELDS,
  DEFAULT_ADSET_FIELDS,
  DEFAULT_CAMPAIGN_FIELDS,
  adsetFields,
  splitFields,
} from "../src/default-fields.js";

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

// Pinned: every name here is a field of the Graph node it is sent to (Marketing API v2x Campaign, AdSet, Ad).
// A name that is not (a targeting key such as age_min on an ad set) fails the whole read with (#100)
// "Tried accessing nonexisting field". Change these only against the Graph reference for that node.
test("the default field lists are pinned", () => {
  assert.equal(
    DEFAULT_CAMPAIGN_FIELDS,
    "id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,bid_strategy,created_time,updated_time",
  );
  assert.equal(
    DEFAULT_ADSET_FIELDS,
    "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,budget_remaining,bid_strategy,bid_amount,optimization_goal,billing_event,start_time,end_time",
  );
  assert.equal(
    DEFAULT_ADSET_DETAIL_FIELDS,
    `${DEFAULT_ADSET_FIELDS},targeting,promoted_object,destination_type,issues_info`,
  );
  assert.equal(
    DEFAULT_AD_FIELDS,
    "id,name,status,effective_status,campaign_id,adset_id,creative{id,name},created_time,updated_time",
  );
});

test("no default field list asks an ad set for a targeting key", () => {
  for (const list of [DEFAULT_ADSET_FIELDS, DEFAULT_ADSET_DETAIL_FIELDS]) {
    for (const part of splitFields(list)) assert.ok(!ADSET_TARGETING_KEYS.has(part), `${part} is a targeting key`);
  }
});

test("get_adset sends the detail fields when omitted", async () => {
  const { handlers, sent } = setup();
  await handlers.get("get_adset")!({ adset_id: "120253301329580163" });
  assert.equal(sent[0].path, "/120253301329580163");
  assert.equal(sent[0].params.fields, DEFAULT_ADSET_DETAIL_FIELDS);
});

const adsetFieldCases: ReadonlyArray<readonly [string, string, string]> = [
  ["nothing to move", "id,name,daily_budget", "id,name,daily_budget"],
  [
    "beta 2026-11-14: age_min asked on the ad set moves under targeting",
    "id,name,status,daily_budget,age_min,age_max,genders,geo_locations",
    "id,name,status,daily_budget,targeting{age_min,age_max,genders,geo_locations}",
  ],
  ["a plain targeting already returns them", "id,targeting,age_min,locales", "id,targeting"],
  [
    "merged into a targeting{…} already asked for, without doubles",
    "id,targeting{geo_locations,age_min},age_min,age_max",
    "id,targeting{geo_locations,age_min,age_max}",
  ],
  [
    "commas inside braces and edges do not split",
    "id,ads{id,creative{id,name}},age_min,insights.date_preset(last_7d){spend,clicks}",
    "id,ads{id,creative{id,name}},insights.date_preset(last_7d){spend,clicks},targeting{age_min}",
  ],
];

for (const [name, given, expected] of adsetFieldCases) {
  test(`adsetFields: ${name}`, () => {
    assert.equal(adsetFields(given), expected);
  });
}

for (const tool of ["get_adset", "list_adsets", "get_campaign_adsets"]) {
  test(`${tool} moves targeting keys the caller asked for at the top level`, async () => {
    const { handlers, sent } = setup();
    await handlers.get(tool)!({ adset_id: "1", campaign_id: "1", fields: "id,name,age_min,age_max" });
    assert.equal(sent[0].params.fields, "id,name,targeting{age_min,age_max}");
  });
}
