<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Marketing Activity | Client Portal' });

const { selectedOrg } = useOrganization();
const { clientScope } = useOrgRole();

const campaignItems = usePortalItems('marketing_campaigns');
const touchItems = usePortalItems('marketing_touches');

const loading = ref(true);
const campaigns = ref<any[]>([]);
const selectedCampaign = ref<any | null>(null);
const showDetail = ref(false);
const touches = ref<any[]>([]);
const loadingTouches = ref(false);

const statusConfig: Record<string, { label: string; classes: string; icon: string }> = {
	draft:         { label: 'Draft',         classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: 'lucide:file' },
	scheduled:     { label: 'Scheduled',     classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: 'lucide:clock' },
	partial_sent:  { label: 'In Progress',   classes: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: 'lucide:send' },
	completed:     { label: 'Completed',     classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: 'lucide:check-circle-2' },
	cancelled:     { label: 'Cancelled',     classes: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500', icon: 'lucide:x-circle' },
	archived:      { label: 'Archived',      classes: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600', icon: 'lucide:archive' },
};

const touchStatusConfig: Record<string, { label: string; dot: string }> = {
	pending:   { label: 'Pending',   dot: 'bg-gray-400' },
	scheduled: { label: 'Scheduled', dot: 'bg-blue-500' },
	sent:      { label: 'Sent',      dot: 'bg-green-500' },
	cancelled: { label: 'Cancelled', dot: 'bg-gray-400' },
	failed:    { label: 'Failed',    dot: 'bg-red-500' },
};

async function loadCampaigns() {
	if (!selectedOrg.value) return;
	loading.value = true;
	try {
		// `marketing_campaigns` has no `client` FK; visibility is org-scoped
		// (the portal proxy already pins org). Per-client filtering will land
		// when campaigns get a touch-variant join surface.
		const conditions: any[] = [
			{ status: { _nin: ['archived'] } },
		];

		campaigns.value = await campaignItems.list({
			filter: { _and: conditions },
			fields: [
				'id', 'title', 'goal', 'status', 'type',
				'start_date', 'end_date',
			],
			sort: ['-start_date'],
			limit: 50,
		});
	} catch (err) {
		console.error('Failed to load campaigns:', err);
	} finally {
		loading.value = false;
	}
}

async function openCampaign(campaign: any) {
	selectedCampaign.value = campaign;
	showDetail.value = true;
	loadingTouches.value = true;
	try {
		touches.value = await touchItems.list({
			filter: { campaign: { _eq: campaign.id } },
			fields: [
				'id', 'kind', 'status', 'send_offset_hours',
				'email_subject', 'email_preview_text',
				'social_channel', 'social_caption',
				'audience_target',
			],
			sort: ['send_offset_hours'],
			limit: 100,
		});
	} catch (err) {
		console.error('Failed to load touches:', err);
		touches.value = [];
	} finally {
		loadingTouches.value = false;
	}
}

function formatDate(d: string) {
	if (!d) return '—';
	return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const sentCount = computed(() => touches.value.filter(t => t.status === 'sent').length);
const pendingCount = computed(() => touches.value.filter(t => ['pending', 'scheduled'].includes(t.status)).length);

onMounted(() => loadCampaigns());
watch(() => selectedOrg.value, () => loadCampaigns());
</script>

<template>
	<div class="portal-page">
		<AppHeader title="Marketing Activity" />

		<LayoutPageContainer>
			<p class="text-sm text-muted-foreground mb-6 -mt-1">Campaigns and outreach activity for your brand.</p>

			<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-24">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
		</div>

		<!-- Empty -->
		<div v-else-if="!campaigns.length" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:megaphone" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">No campaigns yet.</p>
		</div>

		<!-- Campaign List -->
		<div v-else class="space-y-2">
			<button
				v-for="campaign in campaigns"
				:key="campaign.id"
				class="ios-card p-4 flex items-center gap-4 hover:shadow-md transition-shadow w-full text-left group"
				@click="openCampaign(campaign)"
			>
				<div class="flex items-center justify-center w-10 h-10 rounded-full bg-muted/60 shrink-0">
					<Icon
						:name="(statusConfig[campaign.status] ?? statusConfig.draft).icon"
						class="w-5 h-5 text-muted-foreground"
					/>
				</div>

				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2 mb-0.5">
						<span class="text-sm font-medium truncate">{{ campaign.title }}</span>
						<span
							class="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full shrink-0"
							:class="(statusConfig[campaign.status] ?? statusConfig.draft).classes"
						>
							{{ statusConfig[campaign.status]?.label ?? campaign.status }}
						</span>
					</div>
					<div class="flex items-center gap-3 text-xs text-muted-foreground">
						<span v-if="campaign.goal" class="truncate max-w-[200px]">{{ campaign.goal }}</span>
						<span v-if="campaign.start_date">{{ formatDate(campaign.start_date) }}</span>
					</div>
				</div>

				<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
			</button>
		</div>

		<!-- Campaign Detail Slide-over -->
		<Teleport to="body">
			<Transition name="slide">
				<div v-if="showDetail && selectedCampaign" class="fixed inset-0 z-50 flex justify-end">
					<div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="showDetail = false" />
					<div class="relative w-full max-w-lg bg-background border-l border-border shadow-xl overflow-y-auto">
						<div class="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/40 p-4 flex items-center justify-between">
							<h2 class="font-semibold">{{ selectedCampaign.title }}</h2>
							<button class="p-1.5 rounded-lg hover:bg-muted/60 transition-colors" @click="showDetail = false">
								<Icon name="lucide:x" class="w-5 h-5" />
							</button>
						</div>

						<div class="p-5 space-y-5">
							<!-- Status + Dates -->
							<div class="flex gap-6">
								<div>
									<p class="text-xs text-muted-foreground mb-1">Status</p>
									<span
										class="text-xs px-2.5 py-1 rounded-full font-medium"
										:class="(statusConfig[selectedCampaign.status] ?? statusConfig.draft).classes"
									>
										{{ statusConfig[selectedCampaign.status]?.label ?? selectedCampaign.status }}
									</span>
								</div>
								<div v-if="selectedCampaign.start_date">
									<p class="text-xs text-muted-foreground mb-1">Start Date</p>
									<p class="text-sm">{{ formatDate(selectedCampaign.start_date) }}</p>
								</div>
								<div v-if="selectedCampaign.end_date">
									<p class="text-xs text-muted-foreground mb-1">End Date</p>
									<p class="text-sm">{{ formatDate(selectedCampaign.end_date) }}</p>
								</div>
							</div>

							<!-- Goal -->
							<div v-if="selectedCampaign.goal">
								<p class="text-xs text-muted-foreground mb-1">Goal</p>
								<p class="text-sm">{{ selectedCampaign.goal }}</p>
							</div>

							<!-- Touch summary -->
							<div v-if="touches.length || loadingTouches">
								<p class="text-xs text-muted-foreground mb-2">Outreach Touches</p>
								<div v-if="loadingTouches" class="h-8 bg-muted/30 rounded-xl animate-pulse" />
								<template v-else>
									<div class="flex gap-4 mb-3">
										<div class="ios-card px-4 py-2 flex-1 text-center">
											<p class="text-lg font-semibold">{{ sentCount }}</p>
											<p class="text-[10px] text-muted-foreground">Sent</p>
										</div>
										<div class="ios-card px-4 py-2 flex-1 text-center">
											<p class="text-lg font-semibold">{{ pendingCount }}</p>
											<p class="text-[10px] text-muted-foreground">Upcoming</p>
										</div>
										<div class="ios-card px-4 py-2 flex-1 text-center">
											<p class="text-lg font-semibold">{{ touches.length }}</p>
											<p class="text-[10px] text-muted-foreground">Total</p>
										</div>
									</div>

									<div class="space-y-2">
										<div
											v-for="touch in touches"
											:key="touch.id"
											class="flex items-start gap-3 p-3 rounded-xl bg-muted/30"
										>
											<div class="flex items-center justify-center w-6 h-6 rounded-full bg-muted shrink-0 mt-0.5">
												<Icon
													:name="touch.kind === 'email' ? 'lucide:mail' : 'lucide:image'"
													class="w-3.5 h-3.5 text-muted-foreground"
												/>
											</div>
											<div class="flex-1 min-w-0">
												<div class="flex items-center gap-2 mb-0.5">
													<span class="text-xs font-medium capitalize">{{ touch.kind }}</span>
													<div class="flex items-center gap-1">
														<div
															class="w-1.5 h-1.5 rounded-full"
															:class="(touchStatusConfig[touch.status] ?? touchStatusConfig.pending).dot"
														/>
														<span class="text-[10px] text-muted-foreground capitalize">
															{{ touchStatusConfig[touch.status]?.label ?? touch.status }}
														</span>
													</div>
												</div>
												<p v-if="touch.email_subject" class="text-xs text-muted-foreground truncate">
													{{ touch.email_subject }}
												</p>
												<p v-else-if="touch.social_caption" class="text-xs text-muted-foreground line-clamp-1">
													{{ touch.social_caption }}
												</p>
											</div>
										</div>
									</div>
								</template>
							</div>
						</div>
					</div>
				</div>
			</Transition>
		</Teleport>
		</LayoutPageContainer>
	</div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
	transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-enter-from .relative,
.slide-leave-to .relative {
	transform: translateX(100%);
}
.slide-enter-from .absolute,
.slide-leave-to .absolute {
	opacity: 0;
}
</style>
