<!--
  CardDeskSourcePanel — slide-over body for an Earnest contact that was
  sourced via Card Desk. Shows the original deck card (rating, met-at,
  notes) + 5 most recent cd_activities.

  Mounted by `<AppSlideOverStack>` when stack contains a
  `carddesk-source:<contactId>` entry. The `id` prop is the Earnest
  contacts.id — the panel reverse-looks-up the user's cd_contact via
  /api/carddesk/by-contact/<id>.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

interface CdCard {
	id: string;
	name: string | null;
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	phone: string | null;
	company: string | null;
	title: string | null;
	rating: string | null;
	industry: string | null;
	met_at: string | null;
	notes: string | null;
	is_client: boolean;
	date_created: string | null;
}

interface CdActivity {
	id: string;
	type: string;
	label: string | null;
	note: string | null;
	date: string;
	is_response?: boolean;
}

const card = ref<CdCard | null>(null);
const activities = ref<CdActivity[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const displayName = computed(() => {
	if (!card.value) return 'Sourced via Card Desk';
	const c = card.value;
	return c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Card Desk card';
});

const ratingClass = (r: string | null) => {
	if (r === 'hot') return 'bg-destructive/10 text-destructive';
	if (r === 'warm') return 'bg-warning/10 text-warning';
	if (r === 'nurture') return 'bg-success/10 text-success';
	if (r === 'cold') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
	return 'bg-muted text-muted-foreground';
};

const activityIcons: Record<string, string> = {
	email: 'lucide:mail',
	text: 'lucide:message-square',
	call: 'lucide:phone',
	meeting: 'lucide:users',
	linkedin: 'lucide:link',
	card_scanned: 'lucide:scan-line',
	contact_added: 'lucide:user-plus',
	promoted_to_earnest: 'lucide:arrow-up-right-from-square',
	other: 'lucide:circle',
};

watch(
	() => props.id,
	async (id) => {
		if (!id) return;
		loading.value = true;
		error.value = null;
		card.value = null;
		activities.value = [];
		try {
			const res = await $fetch<{ cd_contact: CdCard | null; activities: CdActivity[] }>(
				`/api/carddesk/by-contact/${id}`,
			);
			card.value = res.cd_contact;
			activities.value = res.activities;
		} catch (err: any) {
			error.value = err?.data?.message || err?.message || 'Failed to load Card Desk source';
		} finally {
			loading.value = false;
		}
	},
	{ immediate: true },
);
</script>

<template>
	<AppSlideOverShell :title="displayName" subtitle="Sourced via Card Desk" @close="$emit('close')">
		<div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			<p class="text-xs text-muted-foreground">Loading card…</p>
		</div>

		<div v-else-if="error" class="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
			{{ error }}
		</div>

		<div v-else-if="!card" class="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
			No Card Desk source linked to this contact.
		</div>

		<div v-else class="space-y-5">
			<!-- Card preview -->
			<div class="rounded-xl border border-border bg-card p-4">
				<div class="flex items-center gap-3">
					<div class="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
						{{ (card.first_name || '?').charAt(0) }}{{ (card.last_name || '').charAt(0) }}
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-semibold truncate">{{ displayName }}</p>
						<p v-if="card.title || card.company" class="text-xs text-muted-foreground truncate">
							{{ [card.title, card.company].filter(Boolean).join(' · ') }}
						</p>
					</div>
					<span
						v-if="card.rating"
						class="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize shrink-0"
						:class="ratingClass(card.rating)"
					>
						{{ card.rating }}
					</span>
				</div>

				<div class="mt-4 grid grid-cols-1 gap-2 text-xs text-muted-foreground">
					<div v-if="card.industry" class="flex items-center gap-2">
						<Icon name="lucide:tag" class="w-3.5 h-3.5 shrink-0" />
						<span>{{ card.industry }}</span>
					</div>
					<div v-if="card.met_at" class="flex items-center gap-2">
						<Icon name="lucide:map-pin" class="w-3.5 h-3.5 shrink-0" />
						<span>Met at: {{ card.met_at }}</span>
					</div>
					<div v-if="card.date_created" class="flex items-center gap-2">
						<Icon name="lucide:calendar" class="w-3.5 h-3.5 shrink-0" />
						<span>Scanned {{ new Date(card.date_created).toLocaleDateString() }}</span>
					</div>
				</div>

				<p v-if="card.notes" class="mt-3 text-xs italic text-muted-foreground border-t border-border pt-3">
					{{ card.notes }}
				</p>
			</div>

			<!-- Activity timeline -->
			<div>
				<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
					Recent Card Desk activity
				</h3>
				<div v-if="activities.length === 0" class="text-xs text-muted-foreground italic">
					No activities recorded.
				</div>
				<ul v-else class="space-y-3">
					<li v-for="act in activities" :key="act.id" class="flex gap-2.5 text-xs">
						<div class="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
							<Icon
								:name="activityIcons[act.type] || activityIcons.other"
								class="w-3.5 h-3.5 text-muted-foreground"
							/>
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<span class="font-medium capitalize">{{ act.type.replace(/_/g, ' ') }}</span>
								<span class="text-muted-foreground ml-auto whitespace-nowrap">
									{{ new Date(act.date).toLocaleDateString() }}
								</span>
							</div>
							<p v-if="act.label" class="text-muted-foreground mt-0.5">{{ act.label }}</p>
							<p v-if="act.note" class="text-muted-foreground/80 mt-0.5 italic">{{ act.note }}</p>
						</div>
					</li>
				</ul>
			</div>

			<!-- Footer link to Card Desk — deep-links to this specific card so
			     the dashboard auto-opens its detail panel after the list loads. -->
			<NuxtLink
				:to="`/apps/clients?view=carddesk&selected=${card.id}`"
				class="block text-center text-xs font-medium text-primary hover:underline pt-2"
				@click="$emit('close')"
			>
				Open Card Desk →
			</NuxtLink>
		</div>
	</AppSlideOverShell>
</template>
