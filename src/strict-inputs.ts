import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type StrictableSchema = { strict?: () => unknown };
type RegisteredToolLike = { inputSchema?: StrictableSchema };

/**
 * Make every tool refuse an argument it does not take. zod objects strip
 * unknown keys by default, so a call with `ad_account_id` (not `account_id`)
 * used to run without its account and answer for another one. Call once,
 * after all register* calls; the cast stays in this one function, as in
 * applyToolHints.
 */
export function strictInputs(server: McpServer): void {
  const tools = (server as unknown as { _registeredTools: Record<string, RegisteredToolLike> })
    ._registeredTools;
  Object.values(tools).forEach((tool) => {
    const schema = tool.inputSchema;
    if (schema && typeof schema.strict === "function") {
      tool.inputSchema = schema.strict() as StrictableSchema;
    }
  });
}
