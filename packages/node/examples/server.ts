import { FlagDashServer } from "@flagdash/node";

async function main() {
  const client = FlagDashServer.init({
    sdkKey: "server_your_key_here",
    cacheTtl: 60, // Cache for 60 seconds
  });

  // Evaluate flags with server-side context
  const enabled = await client.flag<boolean>(
    "premium-feature",
    { user: { id: "user_1", plan: "premium" } },
    false,
  );
  console.log("Premium feature enabled:", enabled);

  // Get all flags
  const flags = await client.allFlags({ user: { id: "user_1" } });
  console.log("All flags:", flags);

  // Remote config with caching
  const config = await client.config<string>("api-endpoint", "https://default.api.com");
  console.log("API endpoint:", config);

  // AI configs
  const agent = await client.aiConfig("agent.md");
  console.log("Agent instructions:", agent?.content.substring(0, 100));

  const rules = await client.listAiConfigs({ fileType: "rule", folder: "prompts" });
  console.log("Prompt rules:", rules.length);

  // Clear cache when needed
  client.clearCache();
}

main().catch(console.error);
