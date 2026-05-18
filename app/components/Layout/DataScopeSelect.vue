<!--
  DataScopeSelect — chrome-level "Mine vs. Everyone" toggle.

  Sits next to the client selector in the apps-shell header. Non-admins
  see no chip (they're locked to their own data anyway). Admins/owners
  get a two-state toggle they can use to widen the lens.
-->
<script setup lang="ts">
import { Icon } from '#components';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';

const { scope, canChooseAll, setScope } = useDataScope();

// Hide entirely for users without org-wide visibility — the toggle would
// be a useless decoration and worse, hint at access they don't have.
const visible = computed(() => canChooseAll.value);
</script>

<template>
	<TooltipProvider :delay-duration="200">
		<Tooltip v-if="visible">
			<TooltipTrigger as-child>
				<div
					class="data-scope__pill"
					role="radiogroup"
					aria-label="Data scope"
				>
					<button
						type="button"
						class="data-scope__seg"
						:class="{ 'data-scope__seg--active': scope === 'mine' }"
						role="radio"
						:aria-checked="scope === 'mine'"
						@click="setScope('mine')"
					>
						<Icon name="lucide:user" class="size-3" />
						<span>Mine</span>
					</button>
					<button
						type="button"
						class="data-scope__seg"
						:class="{ 'data-scope__seg--active': scope === 'all' }"
						role="radio"
						:aria-checked="scope === 'all'"
						@click="setScope('all')"
					>
						<Icon name="lucide:users" class="size-3" />
						<span>All</span>
					</button>
				</div>
			</TooltipTrigger>
			<TooltipContent side="bottom" :side-offset="6">
				{{ scope === 'mine' ? 'Showing only your data' : 'Showing the whole organization' }}
			</TooltipContent>
		</Tooltip>
	</TooltipProvider>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.data-scope__pill {
	@apply inline-flex items-center rounded-full border border-border/50 bg-background/60 backdrop-blur-md p-0.5;
	box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.45);
}

.dark .data-scope__pill {
	background: hsl(0 0% 100% / 0.06);
	box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.08);
}

.data-scope__seg {
	@apply inline-flex items-center gap-1 px-2 h-6 rounded-full text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors;
	letter-spacing: 0.08em;
}

.data-scope__seg:hover {
	@apply text-foreground;
}

.data-scope__seg--active {
	@apply bg-foreground text-background;
	box-shadow: 0 1px 2px hsl(0 0% 0% / 0.18);
}

.dark .data-scope__seg--active {
	@apply bg-primary text-primary-foreground;
}
</style>
