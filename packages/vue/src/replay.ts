import { onBeforeUnmount, onMounted, shallowRef, type ShallowRef } from "vue";
import { FlagDashSessionReplay, type SessionReplayOptions } from "@flagdashio/sdk/replay";

export interface VueSessionReplay extends ShallowRef<FlagDashSessionReplay | null> {}

/** Owns one browser recorder for the lifetime of the current Vue component. */
export function useSessionReplay(
  options: SessionReplayOptions & { enabled?: boolean },
): VueSessionReplay {
  const replay = shallowRef<FlagDashSessionReplay | null>(null);

  onMounted(() => {
    if (options.enabled === false) return;
    const instance = new FlagDashSessionReplay(options);
    replay.value = instance;
    void instance.start();
  });

  onBeforeUnmount(() => {
    const instance = replay.value;
    replay.value = null;
    if (instance) void instance.stop();
  });

  return replay;
}

export { FlagDashSessionReplay } from "@flagdashio/sdk/replay";
export type { SessionReplayOptions } from "@flagdashio/sdk/replay";
