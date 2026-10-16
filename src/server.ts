import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRequire } from "node:module";
import { AdsConfig } from "./config.js";
import { AdsClient } from "./services/ads-client.js";

// --- Tool imports ---
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerAdsetTools } from "./tools/adsets.js";
import { registerAdTools } from "./tools/ads.js";
import { registerCreativeTools } from "./tools/creatives.js";
import { registerImageTools } from "./tools/images.js";
import { registerVideoTools } from "./tools/videos.js";
import { registerCanvasTools } from "./tools/canvas.js";
import { registerAudienceTools } from "./tools/audiences.js";
import { registerTargetingTools } from "./tools/targeting.js";
import { registerInsightTools } from "./tools/insights.js";
import { registerLeadTools } from "./tools/leads.js";
import { registerCatalogTools } from "./tools/catalogs.js";
import { registerFeedTools } from "./tools/feeds.js";
import { registerRuleTools } from "./tools/rules.js";
import { registerExperimentTools } from "./tools/experiments.js";
import { registerConversionTools } from "./tools/conversions.js";
import { registerBudgetTools } from "./tools/budget.js";
import { registerReachFrequencyTools } from "./tools/reach_frequency.js";
import { registerBrandSafetyTools } from "./tools/brand_safety.js";
import { registerAccountTools } from "./tools/account.js";
import { registerBusinessTools } from "./tools/business.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerAdLibraryTools } from "./tools/ad_library.js";

// --- Resources & Prompts ---
import { registerResources } from "./resources/account.js";
import { registerPrompts } from "./prompts/index.js";

const require = createRequire(import.meta.url);
export const { version } = require("../package.json") as { version: string };

/** One MCP server with every tool, resource and prompt, bound to one AdsClient. */
export function createServer(config: AdsConfig): McpServer {
  const server = new McpServer({ name: "meta-ads-mcp", version });
  const client = new AdsClient(config);
  registerCampaignTools(server, client);
  registerAdsetTools(server, client);
  registerAdTools(server, client);
  registerCreativeTools(server, client);
  registerImageTools(server, client);
  registerVideoTools(server, client);
  registerCanvasTools(server, client);
  registerAudienceTools(server, client);
  registerTargetingTools(server, client);
  registerInsightTools(server, client);
  registerLeadTools(server, client);
  registerCatalogTools(server, client);
  registerFeedTools(server, client);
  registerRuleTools(server, client);
  registerExperimentTools(server, client);
  registerConversionTools(server, client);
  registerBudgetTools(server, client);
  registerReachFrequencyTools(server, client);
  registerBrandSafetyTools(server, client);
  registerAccountTools(server, client);
  registerBusinessTools(server, client);
  registerAuthTools(server, client);
  registerAdLibraryTools(server, client);
  registerResources(server, client);
  registerPrompts(server);
  return server;
}
