import {
  FlagDashClient,
  type FlagDashConfig,
  type FlagDashRequestError,
} from "@flagdashio/sdk";
import {
  inject,
  readonly,
  ref,
  type App,
  type InjectionKey,
  type Ref,
} from "vue";

export interface FlagDashVueContext {
  client: FlagDashClient;
  isReady: Readonly<Ref<boolean>>;
  error: Readonly<Ref<FlagDashRequestError | null>>;
  destroy(): void;
}

export interface FlagDashVuePlugin extends FlagDashVueContext {
  install(app: App): void;
}

export const flagDashKey: InjectionKey<FlagDashVueContext> = Symbol("FlagDash");

export function createFlagDash(config: FlagDashConfig): FlagDashVuePlugin {
  const client = new FlagDashClient(config);
  const isReady = ref(client.isReady);
  const error = ref<FlagDashRequestError | null>(null);
  const unsubscribers = [
    client.on("ready", () => {
      isReady.value = true;
      error.value = null;
    }),
    client.on("error", (value) => {
      error.value = value instanceof Error ? value : new Error(String(value));
    }),
  ];
  let destroyed = false;

  const context: FlagDashVueContext = {
    client,
    isReady: readonly(isReady),
    error: readonly(error),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
      client.destroy();
      isReady.value = false;
    },
  };

  return {
    ...context,
    install(app: App) {
      app.provide(flagDashKey, context);
      app.config.globalProperties.$flagdash = client;
    },
  };
}

export function useFlagDash(): FlagDashVueContext {
  const context = inject(flagDashKey);
  if (!context) {
    throw new Error("FlagDash composables require app.use(createFlagDash(config))");
  }
  return context;
}

declare module "vue" {
  interface ComponentCustomProperties {
    $flagdash: FlagDashClient;
  }
}
