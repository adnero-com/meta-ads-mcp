import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { READ_ONLY_TOOLS, hintsFor } from "../src/tool-hints.js";

const EXPECTED_READ_ONLY = `generate_preview get_account_activities get_account_insights get_ad get_ad_account get_ad_insights get_ad_preview get_adset get_adset_ads get_adset_insights get_adset_leads get_adset_targeting_sentence get_async_report get_audience get_audience_health get_batch_status get_business get_campaign get_campaign_ads get_campaign_adsets get_campaign_insights get_campaign_leads get_canvas get_catalog get_creative get_delivery_estimate get_experiment get_experiment_results get_feed_uploads get_form_leads get_image get_lead get_lead_form get_product get_product_set get_reach_estimate get_rf_prediction get_rule get_saved_audience get_targeting_suggestions get_video list_account_users list_ad_accounts list_ads list_adsets list_block_lists list_budget_schedules list_business_ad_accounts list_businesses list_business_instagram_accounts list_business_pages list_business_users list_campaigns list_canvases list_catalogs list_creatives list_custom_audiences list_experiments list_feeds list_images list_lead_forms list_offline_event_sets list_products list_product_sets list_rf_predictions list_rules list_saved_audiences list_system_users list_videos search_ad_library search_locations search_targeting search_targeting_map`.split(" ");

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

test("read-only set matches the reviewed table exactly", () => {
  assert.deepEqual([...READ_ONLY_TOOLS].sort(), [...EXPECTED_READ_ONLY].sort());
  assert.equal(READ_ONLY_TOOLS.size, EXPECTED_READ_ONLY.length);
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
  for (const n of ["update_campaign", "update_adset", "update_ad", "remove_users_from_audience"]) {
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
