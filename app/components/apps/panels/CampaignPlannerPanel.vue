<!--
  CampaignPlannerPanel — slide-over wrapper around the AI Campaign Planner.

  Singleton create flow (no per-id route), so `id` is a sentinel `'_'`.
  Replaces the two header + empty-state punch-outs that previously dumped
  the user out of the apps shell onto the legacy planner anchor. Body is
  small enough (one input + result viewer) to live inline — no separate
  surface file.

  Lifted from the marketing intelligence page's planner section. State
  and handlers are private to the panel; the only outward effect is a
  toast on save and navigation when the user picks an activity from the
  generated timeline.
-->
<script setup lang="ts">
import type { CampaignAnalysis, CampaignActivity } from '~~/shared/marketing';
import AppSlideOverShell from '../AppSlideOverShell.vue';

defineProps<{ id: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { selectedOrg } = useOrganization();
const { selectedClient } = useClients();
const toast = useToast();
const router = useRouter();

const campaignGoal = ref('');
const generatingCampaign = ref(false);
const campaignError = ref('');
const campaign = ref<CampaignAnalysis | null>(null);
const savingCampaign = ref(false);
const savedCampaign = ref(false);

async function runCampaignAnalysis() {
	if (!selectedOrg.value || !campaignGoal.value.trim()) return;
	generatingCampaign.value = true;
	campaignError.value = '';
	campaign.value = null;
	try {
		const clientId = selectedClient.value && selectedClient.value !== 'org' ? selectedClient.value : undefined;
		const data = await $fetch('/api/marketing/ai-analyze', {
			method: 'POST',
			body: {
				analysisType: 'campaign',
				organizationId: selectedOrg.value,
				clientId,
				goal: campaignGoal.value,
			},
		});
		campaign.value = data as CampaignAnalysis;
	} catch (err: any) {
		campaignError.value = err?.data?.message || err?.message || 'Failed to generate plan.';
	} finally {
		generatingCampaign.value = false;
	}
}

async function saveCampaign() {
	if (!campaign.value) return;
	savingCampaign.value = true;
	try {
		await $fetch('/api/marketing/save-plan', {
			method: 'POST',
			body: {
				type: 'campaign',
				title: (campaign.value as any).campaignName || 'Campaign Plan',
				data: campaign.value,
				goal: campaignGoal.value,
				organizationId: selectedOrg.value,
			},
		});
		savedCampaign.value = true;
		toast.add({ title: 'Campaign saved', description: 'The plan is now in the Campaigns floor.', color: 'green', icon: 'lucide:check' });
		setTimeout(() => { savedCampaign.value = false; }, 3000);
	} catch (err) {
		toast.add({ title: 'Save failed', description: 'Could not save the campaign plan.', color: 'red', icon: 'lucide:alert-circle' });
	} finally {
		savingCampaign.value = false;
	}
}

// Closing the panel after picking an activity is intentional — the
// channel composers (social / email) take over from there.
function handleCampaignCreate(activity: CampaignActivity) {
	emit('close');
	if (activity.channel === 'social') router.push('/apps/marketing?floor=studio');
	else if (activity.channel === 'email') router.push('/apps/marketing?floor=email');
}

const subtitle = computed(() => {
	if (campaign.value) return (campaign.value as any).campaignName || 'Generated plan';
	if (generatingCampaign.value) return 'Earnest is planning…';
	return 'Describe a goal, get a multi-channel plan';
});
</script>

<template>
	<AppSlideOverShell
		title="Campaign Planner"
		:subtitle="subtitle"
		@close="$emit('close')"
	>
		<div class="space-y-4">
			<div class="flex flex-col sm:flex-row gap-2">
				<input
					v-model="campaignGoal"
					type="text"
					placeholder="e.g. Launch our new service next month, re-engage churned clients…"
					class="flex-1 rounded-full border bg-muted/20 px-4 py-2 text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all placeholder:text-muted-foreground/50"
					@keyup.enter="runCampaignAnalysis"
				>
				<button
					type="button"
					class="rounded-full px-4 py-2 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5 shrink-0 disabled:opacity-40"
					:disabled="!campaignGoal.trim() || generatingCampaign"
					@click="runCampaignAnalysis"
				>
					<EarnestIcon v-if="!generatingCampaign" class="w-3.5 h-3.5" />
					<Icon v-else name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
					{{ generatingCampaign ? 'Planning…' : 'Generate Plan' }}
				</button>
			</div>

			<div v-if="campaignError" class="ios-card border-l-4 border-l-destructive bg-destructive/5 p-3 text-center">
				<p class="text-xs text-destructive">{{ campaignError }}</p>
			</div>

			<div v-if="!campaign && !generatingCampaign && !campaignError" class="ios-card border-2 border-dashed border-border/50 p-6 text-center">
				<Icon name="lucide:rocket" class="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
				<p class="text-xs text-muted-foreground">
					Tell Earnest what you want this campaign to do.
				</p>
				<p class="text-[11px] text-muted-foreground/70 mt-1">
					You'll get a week-by-week, multi-channel plan you can save and act on.
				</p>
			</div>

			<div v-if="generatingCampaign" class="ios-card p-6 text-center">
				<Icon name="lucide:loader-2" class="w-6 h-6 text-primary/60 mx-auto mb-2 animate-spin" />
				<p class="text-xs text-muted-foreground">Drafting your multi-channel plan…</p>
			</div>

			<div v-if="campaign && !generatingCampaign">
				<div class="flex justify-end mb-2">
					<button
						type="button"
						class="rounded-full px-3 py-1 text-[10px] font-medium border border-border bg-card hover:bg-muted ios-press transition-colors inline-flex items-center gap-1 disabled:opacity-40"
						:disabled="savingCampaign"
						@click="saveCampaign"
					>
						<Icon :name="savedCampaign ? 'lucide:check' : savingCampaign ? 'lucide:loader-2' : 'lucide:save'" class="w-3 h-3" :class="{ 'animate-spin': savingCampaign }" />
						{{ savedCampaign ? 'Saved' : savingCampaign ? 'Saving…' : 'Save Plan' }}
					</button>
				</div>
				<MarketingCampaignTimeline
					:campaign="campaign"
					@create="handleCampaignCreate"
				/>
			</div>
		</div>
	</AppSlideOverShell>
</template>
