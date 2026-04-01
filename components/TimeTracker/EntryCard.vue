<template>
	<div class="ios-card rounded-2xl border border-border bg-card p-4" :class="{ 'ring-2 ring-primary/30': selected }">
		<div class="flex items-center gap-3">
			<!-- Selection checkbox -->
			<div v-if="selectable" class="shrink-0">
				<input
					type="checkbox"
					:checked="selected"
					class="h-4 w-4 rounded border-border text-primary focus:ring-primary/50 cursor-pointer"
					@change="emit('select', entry)"
				/>
			</div>

			<!-- Duration badge -->
			<div class="shrink-0">
				<span class="inline-flex items-center rounded-lg bg-primary/10 text-primary px-2.5 py-1.5 text-sm font-semibold font-mono tabular-nums">
					{{ formattedDuration }}
				</span>
			</div>

			<!-- Center: description + pills -->
			<div class="flex-1 min-w-0 space-y-1">
				<!-- User name (team view) -->
				<div v-if="showUser && userName" class="flex items-center gap-1.5 mb-0.5">
					<div
						v-if="userAvatar"
						class="w-4 h-4 rounded-full bg-muted overflow-hidden"
					>
						<NuxtImg :src="userAvatar" :alt="userName" class="w-full h-full object-cover" />
					</div>
					<span class="text-[11px] font-medium text-muted-foreground">{{ userName }}</span>
				</div>

				<p v-if="entry.description" class="text-sm font-medium text-foreground truncate">
					{{ entry.description }}
				</p>
				<p v-else class="text-sm text-muted-foreground italic truncate">
					No description
				</p>

				<div class="flex flex-wrap items-center gap-1">
					<Badge v-if="clientName" variant="secondary" class="text-[11px] px-1.5 py-0">
						{{ clientName }}
					</Badge>
					<Badge v-if="projectName" variant="outline" class="text-[11px] px-1.5 py-0">
						{{ projectName }}
					</Badge>
					<span
						v-if="entry.billable"
						class="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
					>
						<Icon name="lucide:dollar-sign" class="w-3 h-3" />
					</span>
					<!-- Billing status badges -->
					<Badge
						v-if="entry.billed && invoiceStatus === 'paid'"
						variant="outline"
						class="text-[11px] px-1.5 py-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
					>
						Paid
					</Badge>
					<Badge
						v-else-if="entry.billed"
						variant="outline"
						class="text-[11px] px-1.5 py-0 border-amber-500/30 text-amber-600 dark:text-amber-400"
					>
						Billed
					</Badge>
					<!-- Invoice code link -->
					<NuxtLink
						v-if="invoiceCode"
						:to="`/invoices`"
						class="text-[11px] text-blue-500 hover:underline"
					>
						{{ invoiceCode }}
					</NuxtLink>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex items-center gap-0.5 shrink-0">
				<Button variant="ghost" size="icon-sm" @click="emit('edit', entry)">
					<Icon name="lucide:pencil" class="w-3.5 h-3.5 text-muted-foreground" />
				</Button>
				<Button variant="ghost" size="icon-sm" @click="emit('delete', entry)">
					<Icon name="lucide:trash-2" class="w-3.5 h-3.5 text-muted-foreground" />
				</Button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { TimeEntry } from '~/types/directus';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';

const props = withDefaults(defineProps<{
	entry: TimeEntry;
	showUser?: boolean;
	selectable?: boolean;
	selected?: boolean;
}>(), {
	showUser: false,
	selectable: false,
	selected: false,
});

const emit = defineEmits<{
	edit: [entry: TimeEntry];
	delete: [entry: TimeEntry];
	select: [entry: TimeEntry];
}>();

const { formatDuration } = useTimeTracker();

const formattedDuration = computed(() => {
	return formatDuration(props.entry.duration_minutes || 0);
});

const clientName = computed(() => {
	const client = props.entry.client;
	if (!client) return null;
	if (typeof client === 'object' && 'name' in client) return client.name;
	return null;
});

const projectName = computed(() => {
	const project = props.entry.project;
	if (!project) return null;
	if (typeof project === 'object' && 'title' in project) return project.title;
	return null;
});

const userName = computed(() => {
	const u = props.entry.user as any;
	if (!u || typeof u !== 'object') return null;
	return [u.first_name, u.last_name].filter(Boolean).join(' ') || null;
});

const userAvatar = computed(() => {
	const u = props.entry.user as any;
	if (!u || typeof u !== 'object') return null;
	return u.avatar || null;
});

const invoiceCode = computed(() => {
	const inv = props.entry.invoice as any;
	if (!inv || typeof inv !== 'object') return null;
	return inv.invoice_code || null;
});

const invoiceStatus = computed(() => {
	const inv = props.entry.invoice as any;
	if (!inv || typeof inv !== 'object') return null;
	return inv.status || null;
});
</script>
