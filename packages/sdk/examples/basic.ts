import { FlagDashClient } from "@flagdash/sdk";

async function main() {
  const client = new FlagDashClient({
    sdkKey: "client_your_key_here",
    refreshInterval: 30000, // Poll every 30s
  });

  // Listen for readiness
  client.on("ready", () => {
    console.log("FlagDash client ready!");
  });

  // Evaluate a feature flag
  const showBanner = await client.flag<boolean>("show-banner", { user: { id: "user_1" } }, false);
  console.log("Show banner:", showBanner);

  // Evaluate with targeting context
  const variant = await client.flag<string>(
    "checkout-flow",
    { user: { id: "user_1", plan: "pro", country: "US" } },
    "control",
  );
  console.log("Checkout variant:", variant);

  // Get all flags at once
  const flags = await client.allFlags({ user: { id: "user_1" } });
  console.log("All flags:", flags);

  // Remote config
  const maxRetries = await client.config<number>("max-retries", 3);
  console.log("Max retries:", maxRetries);

  // AI configs
  const agentConfig = await client.aiConfig("agent.md");
  console.log("Agent config:", agentConfig?.content);

  const skills = await client.listAiConfigs({ fileType: "skill" });
  console.log("Skills:", skills);

  // Clean up
  client.destroy();
}

main().catch(console.error);
