<!--
  Shared tab pill row for the client surface. Both the full-page detail
  and the slide-over render the same 8 tabs with the same counts so the
  two surfaces stay aligned.
-->
<script setup lang="ts">
export type ClientTabKey =
	| 'overview'
	| 'activity'
	| 'contacts'
	| 'projects'
	| 'documents'
	| 'tickets'
	| 'tasks'
	| 'meetings'
	| 'content'
	| 'invoices'
	| 'partners'
	| 'messages';

defineProps<{
	modelValue: ClientTabKey;
	counts: Partial<Record<ClientTabKey, number>>;
}>();

const emit = defineEmits<{
	(e: 'update:modelValue', value: ClientTabKey): void;
	(e: 'prefetch', value: ClientTabKey): void;
}>();

// Hovering/focusing a tab is a strong signal of intent — fire `prefetch`
// so the parent can warm the lazy loader before the click lands. Dedupe
// per-key so a wandering cursor doesn't re-emit on every mouse re-entry.
const _prefetched = new Set<ClientTabKey>();
function prefetch(key: ClientTabKey) {
	if (_prefetched.has(key)) return;
	_prefetched.add(key);
	emit('prefetch', key);
}

const tabs: Array<{ key: ClientTabKey; label: string; icon: string }> = [
	{ key: 'overview', label: 'Overview', icon: 'lucide:building-2' },
	{ key: 'contacts', label: 'Contacts', icon: 'lucide:users' },
	{ key: 'projects', label: 'Projects', icon: 'lucide:folder-kanban' },
	{ key: 'documents', label: 'Documents', icon: 'lucide:files' },
	{ key: 'tickets', label: 'Tickets', icon: 'lucide:ticket' },
	{ key: 'tasks', label: 'Tasks', icon: 'lucide:check-square' },
	{ key: 'meetings', label: 'Meetings', icon: 'lucide:video' },
	{ key: 'content', label: 'Content', icon: 'lucide:palette' },
	{ key: 'invoices', label: 'Invoices', icon: 'lucide:file-text' },
	{ key: 'partners', label: 'Partners', icon: 'lucide:network' },
	{ key: 'messages', label: 'Messages', icon: 'lucide:message-square' },
	// Activity lives last — the deepest history, not the landing view.
	{ key: 'activity', label: 'Activity', icon: 'lucide:activity' },
];
</script>

<template>
	<div class="flex flex-wrap gap-1.5">
		<button
			v-for="tab in tabs"
			:key="tab.key"
			class="inline-flex items-center gap-2 h-8 px-3.5 rounded-full text-xs font-medium border transition-colors"
			:class="modelValue === tab.key
				? 'bg-primary text-primary-foreground border-primary'
				: 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'"
			@click="$emit('update:modelValue', tab.key)"
			@mouseenter="prefetch(tab.key)"
			@focus="prefetch(tab.key)"
			@touchstart.passive="prefetch(tab.key)"
		>
			<Icon :name="tab.icon" class="w-3.5 h-3.5" />
			{{ tab.label }}
			<span v-if="!['overview', 'activity'].includes(tab.key) && counts[tab.key] !== undefined" class="text-[10px] opacity-70 ml-0.5">
				{{ counts[tab.key] }}
			</span>
		</button>
	</div>
</template>
