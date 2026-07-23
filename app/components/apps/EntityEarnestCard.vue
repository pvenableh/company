<!--
	EntityEarnestCard — the "Earnest is focused on THIS item" surface, shown at
	the top of a client or project Overview. The moment a user opens the item it
	offers:
	  · entity-scoped prompts (Summarize activity, What's outstanding, What's
	    blocking this project…) that open the docked Earnest already aware of
	    this specific client/project and auto-send, and
	  · a one-tap "Convene the Boardroom" scoped to just this item.

	Prompts come from useEarnestAwareness — already scoped to the page's entity
	(the detail page called setEntity). The Boardroom keys off the PLURAL
	collection name, so we map singular → plural here.
-->
<script setup lang="ts">
import { Button } from '~/components/ui/button';

const props = defineProps<{
	entityType: 'client' | 'project';
	entityId: string;
	label: string;
	// Some surfaces (e.g. the project detail header) already expose a Convene
	// button — pass `hide-convene` there to avoid a duplicate on this card.
	hideConvene?: boolean;
}>();

const { suggestedPrompts } = useEarnestAwareness();
const { openEarnestPanel } = useEarnestPanel();
const { open: openBoardroom } = useBoardroom();

// useEntityPageContext / awareness use the singular type ('client'); the
// Boardroom + /api/ai/director/* endpoints key off the plural collection.
const COLLECTION: Record<string, string> = { client: 'clients', project: 'projects' };

function ask(prompt: string) {
	// openEarnestPanel opens the dock AND auto-sends — the entity context is
	// already set by the page, so the reply is aware of this client/project.
	openEarnestPanel(prompt);
}

function convene() {
	openBoardroom({
		mode: 'entity',
		entityType: COLLECTION[props.entityType] || props.entityType,
		entityId: props.entityId,
		label: props.label,
	});
}

// Project-only: ask Earnest to propose a full timeline of events + tasks. The
// page has already set the entity context, so Earnest's add_event / add_task
// tools target THIS project and its proposals land in the HITL queue for
// approval (nothing is created without a yes).
function draftTimeline() {
	ask(`Draft a timeline for the project "${props.label}": propose the key events, milestones, and tasks it needs to get done, in a sensible order, and add them to this project. Check with me before anything with a cost or a hard deadline.`);
}
</script>

<template>
	<div class="ios-card p-4 mb-4">
		<div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
			<div class="flex items-center gap-2 min-w-0">
				<EarnestPresenceMark :height="16" class="text-foreground/80 shrink-0" />
				<p class="text-sm font-medium truncate">
					Earnest is focused on <span class="text-primary">{{ label }}</span>
				</p>
			</div>
			<div class="flex items-center gap-2 shrink-0">
				<Button v-if="entityType === 'project'" size="sm" class="shrink-0" @click="draftTimeline">
					<Icon name="lucide:sparkles" class="w-4 h-4 mr-1.5" />
					Draft a timeline
				</Button>
				<Button v-if="!hideConvene" variant="outline" size="sm" class="shrink-0" @click="convene">
					<DirectorChairIcon class="w-4 h-4 mr-1.5" />
					Convene the Boardroom
				</Button>
			</div>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				v-for="p in suggestedPrompts"
				:key="p"
				type="button"
				class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground/80 hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors ios-press"
				@click="ask(p)"
			>
				<Icon name="lucide:sparkles" class="w-3 h-3 text-primary/70" />
				{{ p }}
			</button>
		</div>
	</div>
</template>
