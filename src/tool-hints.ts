import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tools that only issue Graph GET requests. The single source of truth for
 * `readOnlyHint`; every tool not listed here is treated as a write.
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "generate_preview",
  "get_account_activities",
  "get_account_insights",
  "get_ad",
  "get_ad_account",
  "get_ad_insights",
  "get_ad_preview",
  "get_adset",
  "get_adset_ads",
  "get_adset_insights",
  "get_adset_leads",
  "get_adset_targeting_sentence",
  "get_async_report",
  "get_audience",
  "get_audience_health",
  "get_batch_status",
  "get_business",
  "get_campaign",
  "get_campaign_ads",
  "get_campaign_adsets",
  "get_campaign_insights",
  "get_campaign_leads",
  "get_canvas",
  "get_catalog",
  "get_creative",
  "get_delivery_estimate",
  "get_experiment",
  "get_experiment_results",
  "get_feed_uploads",
  "get_form_leads",
  "get_image",
  "get_lead",
  "get_lead_form",
  "get_product",
  "get_product_set",
  "get_reach_estimate",
  "get_rf_prediction",
  "get_rule",
  "get_saved_audience",
  "get_targeting_suggestions",
  "get_video",
  "list_account_users",
  "list_ad_accounts",
  "list_ads",
  "list_adsets",
  "list_block_lists",
  "list_budget_schedules",
  "list_business_ad_accounts",
  "list_businesses",
  "list_business_instagram_accounts",
  "list_business_pages",
  "list_business_users",
  "list_campaigns",
  "list_canvases",
  "list_catalogs",
  "list_creatives",
  "list_custom_audiences",
  "list_experiments",
  "list_feeds",
  "list_images",
  "list_lead_forms",
  "list_offline_event_sets",
  "list_products",
  "list_product_sets",
  "list_rf_predictions",
  "list_rules",
  "list_saved_audiences",
  "list_system_users",
  "list_videos",
  "search_ad_library",
  "search_locations",
  "search_targeting",
  "search_targeting_map",
]);

/**
 * Writes that remove data or can stop delivery (pausing, ending, deleting).
 * Besides these, every `delete_*` tool is destructive. Create, copy and upload
 * tools only add objects, so they are not destructive.
 */
export const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set([
  "update_campaign",
  "update_adset",
  "update_ad",
  "update_rule",
  "update_experiment",
  "update_budget_schedule",
  "remove_users_from_audience",
  "remove_from_block_list",
  "remove_business_user",
]);

/** Writes that only add objects or send new data; safe to mark non-destructive. */
const ADDITIVE_PREFIXES: ReadonlyArray<string> = ["create_", "copy_", "upload_"];

const isKnownNonDestructive = (name: string): boolean =>
  ADDITIVE_PREFIXES.some((p) => name.startsWith(p)) || KNOWN_NON_DESTRUCTIVE_WRITES.has(name);

/** Delete-style or delivery-stopping writes, and any write we have not classified (safe default). */
const isDestructive = (name: string): boolean =>
  !READ_ONLY_TOOLS.has(name) &&
  (name.startsWith("delete_") || DESTRUCTIVE_TOOLS.has(name) || !isKnownNonDestructive(name));

/**
 * Writes reviewed by hand and judged non-destructive: they add or send data,
 * or only mint/extend a token, and none removes data or stops delivery.
 */
const KNOWN_NON_DESTRUCTIVE_WRITES: ReadonlySet<string> = new Set([
  "add_to_block_list",
  "add_users_to_audience",
  "add_business_user",
  "batch_products",
  "create_async_report",
  "debug_token",
  "exchange_token",
  "refresh_token",
  "send_conversion_event",
  "send_offline_event",
  "update_ad_account",
  "update_audience",
  "update_catalog",
  "update_creative",
  "update_product",
  "update_product_set",
]);

export function hintsFor(name: string): ToolAnnotations {
  const readOnly = READ_ONLY_TOOLS.has(name);
  return {
    readOnlyHint: readOnly,
    destructiveHint: isDestructive(name),
    idempotentHint: readOnly,
    openWorldHint: true,
  };
}

type RegisteredToolLike = { update(updates: { annotations?: ToolAnnotations }): void };

/**
 * Set annotations on every tool registered so far. Call once, after all
 * register* calls. The SDK keeps registered tools in a private map; that is
 * the only way to enumerate them, so the cast stays in this one function.
 */
export function applyToolHints(server: McpServer): void {
  const tools = (server as unknown as { _registeredTools: Record<string, RegisteredToolLike> })
    ._registeredTools;
  Object.entries(tools).forEach(([name, tool]) => tool.update({ annotations: hintsFor(name) }));
}
