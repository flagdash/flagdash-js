import { FlagDashManagement } from "@flagdash/node";

async function main() {
  const client = FlagDashManagement.init({
    apiKey: "management_your_key_here",
    baseUrl: "https://your-instance.flagdash.com",
  });

  const projectId = "prj_your_project_id";

  // --- Feature Flags ---

  // Create a flag
  const flag = await client.createFlag({
    project_id: projectId,
    key: "new-checkout",
    name: "New Checkout Flow",
    flag_type: "boolean",
    default_value: false,
  });
  console.log("Created flag:", flag.key);

  // Toggle it on
  await client.toggleFlag("new-checkout");
  console.log("Flag toggled on");

  // Set rollout percentage
  await client.updateRollout("new-checkout", 25);
  console.log("Rollout set to 25%");

  // Set A/B test variations
  await client.setVariations("new-checkout", [
    { key: "control", value: false, weight: 50 },
    { key: "treatment", value: true, weight: 50 },
  ]);
  console.log("Variations configured");

  // List all flags
  const flags = await client.listFlags(projectId);
  console.log(`Total flags: ${flags.length}`);

  // --- Remote Configs ---

  const config = await client.createConfig({
    project_id: projectId,
    key: "max-upload-size",
    name: "Max Upload Size",
    config_type: "number",
    default_value: 10485760,
  });
  console.log("Created config:", config.key);

  // --- AI Configs ---

  const aiConfig = await client.createAiConfig({
    project_id: projectId,
    environment_id: "env_production",
    file_name: "agent.md",
    file_type: "agent",
    content: "# Agent Instructions\n\nYou are a helpful assistant.",
    folder: "prompts",
  });
  console.log("Created AI config:", aiConfig.file_name);

  // Initialize default AI configs for an environment
  await client.initializeDefaults(projectId, "env_staging");
  console.log("Defaults initialized for staging");

  // --- Webhooks ---

  const webhook = await client.createWebhook({
    project_id: projectId,
    url: "https://your-app.com/webhooks/flagdash",
    events: ["flag.updated", "config.updated"],
    description: "Notify on changes",
  });
  console.log("Created webhook:", webhook.id);

  // List delivery logs
  const deliveries = await client.listDeliveries(webhook.id);
  console.log(`Deliveries: ${deliveries.length}`);
}

main().catch(console.error);
