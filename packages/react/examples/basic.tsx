import React from "react";
import {
  FlagDashProvider,
  FlagDashErrorBoundary,
  useFlag,
  useFlagWithLoading,
  useConfig,
  useAiConfig,
  useAiConfigs,
  useFlagDash,
} from "@flagdash/react";

// 1. Wrap your app with the provider
function App() {
  return (
    <FlagDashProvider sdkKey="client_pk_your_key_here" environment="production">
      <FlagDashErrorBoundary fallback={<div>Something went wrong</div>}>
        <Dashboard />
      </FlagDashErrorBoundary>
    </FlagDashProvider>
  );
}

// 2. Use feature flags in components
function Dashboard() {
  // Simple boolean flag
  const showBanner = useFlag("show-banner", false);

  // Flag with loading state
  const { value: theme, isLoading } = useFlagWithLoading<string>("theme", "light");

  // Remote config
  const maxItems = useConfig<number>("max-items", 10);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div data-theme={theme}>
      {showBanner && <PromoBanner />}
      <ItemList max={maxItems} />
      <AiAssistant />
    </div>
  );
}

// 3. Use AI configs
function AiAssistant() {
  // Get a single AI config file
  const { content, isLoading } = useAiConfig("agent.md");

  // List AI configs by type
  const { configs: skills } = useAiConfigs({ fileType: "skill" });

  if (isLoading) return <div>Loading AI config...</div>;

  return (
    <div>
      <h3>Agent Instructions</h3>
      <pre>{content}</pre>
      <h3>Available Skills ({skills.length})</h3>
      <ul>
        {skills.map((s) => (
          <li key={s.file_name}>{s.file_name}</li>
        ))}
      </ul>
    </div>
  );
}

// 4. Access the raw client
function DebugPanel() {
  const { client, isReady } = useFlagDash();

  if (!isReady) return <div>Initializing...</div>;

  return (
    <button onClick={() => client?.allFlags().then(console.log)}>
      Log all flags
    </button>
  );
}

function PromoBanner() {
  return <div className="banner">Special offer!</div>;
}

function ItemList({ max }: { max: number }) {
  return <div>Showing up to {max} items</div>;
}

export default App;
