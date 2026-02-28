<script setup lang="ts">
/**
 * UTooltip - NuxtUI-compatible tooltip wrapper for shadcn-vue Tooltip
 *
 * Usage:
 *   <UTooltip text="Help text">
 *     <UButton>Hover me</UButton>
 *   </UTooltip>
 */

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const props = withDefaults(
  defineProps<{
    text?: string;
    popper?: {
      placement?: string;
      arrow?: boolean;
      offsetDistance?: number;
    };
    delayDuration?: number;
    class?: string;
  }>(),
  {
    delayDuration: 200,
  }
);

const side = computed(() => {
  const placement = props.popper?.placement || "top";
  if (placement.startsWith("bottom")) return "bottom" as const;
  if (placement.startsWith("right")) return "right" as const;
  if (placement.startsWith("left")) return "left" as const;
  return "top" as const;
});

const align = computed(() => {
  const placement = props.popper?.placement || "top";
  if (placement.endsWith("-start")) return "start" as const;
  if (placement.endsWith("-end")) return "end" as const;
  return "center" as const;
});
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration">
    <Tooltip>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipContent
        v-if="text"
        :side="side"
        :align="align"
        :side-offset="popper?.offsetDistance || 4"
        :class="$props.class"
      >
        {{ text }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
