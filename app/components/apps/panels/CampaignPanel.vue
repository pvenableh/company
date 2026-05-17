<!--
  CampaignPanel — quick-edit status / goal / start+end dates for a single
  marketing campaign. Big edits (touch plan, recipients) still live on
  /marketing-timeline; this panel optimises the common "bump a status"
  workflow without a full-page navigation.

  Save bumps a shared `useState` counter so any page that lists campaigns
  (currently /apps/marketing) can react and refetch without us needing a
  direct ref into the page module.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const { pop } = useAppSlideOverStack();
const refreshSignal = useState<number>('marketing-campaigns-refresh', () => 0);

const campaignItemsApi = useDirectusItems('marketing_campaigns');

const campaign = ref<any | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const saving = ref(false);

const draft = reactive<{ status: string; goal: string; start_date: string; end_date: string }>({
	status: '',
	goal: '',
	start_date: '',
	end_date: '',
});

const STATUS_OPTIONS = ['draft', 'active', 'paused', 'completed'];

function toDateInput(s: string | null | undefined): string {
	if (!s) return '';
	try {
		const d = new Date(s);
		if (Number.isNaN(d.getTime())) return '';
		return d.toISOString().slice(0, 10);
	} catch {
		return '';
	}
}

watch(
	() => props.id,
	async (id) => {
		if (!id) return;
		loading.value = true;
		error.value = null;
		campaign.value = null;
		try {
			campaign.value = await campaignItemsApi.get(id, {
				fields: ['id', 'title', 'status', 'goal', 'start_date', 'end_date'],
			});
			if (campaign.value) {
				draft.status = campaign.value.status || 'draft';
				draft.goal = campaign.value.goal || '';
				draft.start_date = toDateInput(campaign.value.start_date);
				draft.end_date = toDateInput(campaign.value.end_date);
			}
		} catch (err: any) {
			error.value = err?.message || 'Failed to load campaign';
		} finally {
			loading.value = false;
		}
	},
	{ immediate: true },
);

async function save() {
	if (!campaign.value || saving.value) return;
	saving.value = true;
	try {
		await $fetch(`/api/marketing/campaigns/${campaign.value.id}`, {
			method: 'PATCH',
			body: {
				status: draft.status,
				goal: draft.goal,
				start_date: draft.start_date || null,
				end_date: draft.end_date || null,
			},
		});
		// Bump shared refresh signal so listing pages refetch in the
		// background. Then pop the panel so the user sees the result.
		refreshSignal.value++;
		pop();
	} catch (err) {
		console.error('[CampaignPanel] save failed', err);
	} finally {
		saving.value = false;
	}
}
</script>

<template>
	<AppSlideOverShell :title="campaign?.title || 'Campaign'" @close="$emit('close')">
		<div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			<p class="text-xs text-muted-foreground">Loading campaign…</p>
		</div>

		<div v-else-if="campaign" class="space-y-5">
			<div>
				<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Status</label>
				<div
					class="mt-1 inline-flex items-center gap-1 rounded-full border border-border bg-card p-0.5"
				>
					<button
						v-for="opt in STATUS_OPTIONS"
						:key="opt"
						type="button"
						class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize transition-colors"
						:class="
							draft.status === opt
								? 'bg-foreground text-background'
								: 'text-muted-foreground hover:text-foreground'
						"
						@click="draft.status = opt"
					>
						{{ opt }}
					</button>
				</div>
			</div>

			<div>
				<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Goal</label>
				<textarea
					v-model="draft.goal"
					rows="3"
					class="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
					placeholder="What outcome should this campaign drive?"
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Start</label>
					<input
						v-model="draft.start_date"
						type="date"
						class="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
					/>
				</div>
				<div>
					<label class="text-[10px] uppercase tracking-wider text-muted-foreground">End</label>
					<input
						v-model="draft.end_date"
						type="date"
						class="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
					/>
				</div>
			</div>

			<div class="flex items-center justify-between pt-3 border-t border-border/30">
				<NuxtLink
					:to="`/marketing-timeline?campaign=${campaign.id}`"
					class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
				>
					Open in timeline
					<Icon name="lucide:external-link" class="w-3 h-3" />
				</NuxtLink>
				<button
					type="button"
					:disabled="saving"
					class="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60"
					@click="save"
				>
					<Icon v-if="saving" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1 animate-spin" />
					Save
				</button>
			</div>
		</div>

		<div v-else-if="error" class="text-sm text-destructive py-10 text-center">{{ error }}</div>

		<div v-else class="text-sm text-muted-foreground py-10 text-center">
			Could not load campaign.
		</div>
	</AppSlideOverShell>
</template>
