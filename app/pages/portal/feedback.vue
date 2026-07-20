<script setup lang="ts">
/**
 * /portal/feedback — the client's feedback hub. Three surfaces:
 *   1. Rate your agency  → private feedback to the org (/api/portal/agency-rating)
 *   2. Rate Earnest      → platform review (/api/portal/earnest-review)
 *   3. Start your own Earnest → interest/referral signal (/api/portal/earnest-interest)
 */
import { toast } from 'vue-sonner';
import { Button } from '~/components/ui/button';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Feedback | Client Portal' });

const { user } = useDirectusAuth();
const { clientName } = useClientPortalUser();

// ── 1. Agency rating ─────────────────────────────────────────────────
const agencyRating = ref(0);
const agencyComment = ref('');
const agencySending = ref(false);
const agencyDone = ref(false);

async function submitAgency() {
	if (!agencyRating.value || agencySending.value) return;
	agencySending.value = true;
	try {
		await $fetch('/api/portal/agency-rating', {
			method: 'POST',
			body: { rating: agencyRating.value, comment: agencyComment.value.trim() || null },
		});
		agencyDone.value = true;
		toast.success('Thanks — your feedback was sent to your team.');
	} catch (e: any) {
		toast.error(e?.data?.message || 'Could not send feedback.');
	} finally {
		agencySending.value = false;
	}
}

// ── 2. Earnest review ────────────────────────────────────────────────
const earnestRating = ref(0);
const earnestQuote = ref('');
const earnestPublic = ref(false);
const earnestSending = ref(false);
const earnestDone = ref(false);

async function submitEarnest() {
	if (!earnestRating.value || !earnestQuote.value.trim() || earnestSending.value) return;
	earnestSending.value = true;
	try {
		await $fetch('/api/portal/earnest-review', {
			method: 'POST',
			body: {
				rating: earnestRating.value,
				quote: earnestQuote.value.trim(),
				isPublic: earnestPublic.value,
				displayName: earnestPublic.value ? [user.value?.first_name, user.value?.last_name].filter(Boolean).join(' ') : null,
				displayCompany: earnestPublic.value ? clientName.value : null,
			},
		});
		earnestDone.value = true;
		toast.success('Thank you for reviewing Earnest!');
	} catch (e: any) {
		toast.error(e?.data?.message || 'Could not submit review.');
	} finally {
		earnestSending.value = false;
	}
}

// ── 3. Start your own Earnest ────────────────────────────────────────
const interestSending = ref(false);
const interestDone = ref(false);

async function expressInterest(kind: 'own_workspace' | 'referral') {
	if (interestSending.value) return;
	interestSending.value = true;
	try {
		await $fetch('/api/portal/earnest-interest', { method: 'POST', body: { kind } });
		interestDone.value = true;
		toast.success("Thanks — the Earnest team will reach out.");
	} catch (e: any) {
		toast.error(e?.data?.message || 'Something went wrong.');
	} finally {
		interestSending.value = false;
	}
}
</script>

<template>
	<div class="portal-page">
		<AppHeader title="Feedback" />

		<LayoutPageContainer>
			<p class="text-sm text-muted-foreground mb-6 -mt-1">
				Tell us how it's going — your team, the platform, and what's next.
			</p>

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
				<!-- ── 1. Rate your agency ─────────────────────────────── -->
				<div class="ios-card p-5">
					<h2 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 flex items-center gap-2">
						<Icon name="lucide:heart-handshake" class="w-3.5 h-3.5" />
						Rate your agency
					</h2>
					<p class="text-xs text-muted-foreground mb-4">
						Private — shared only with {{ clientName ? `${clientName}'s team` : 'your team' }}, never public.
					</p>

					<template v-if="!agencyDone">
						<PortalStarInput v-model="agencyRating" class="mb-3" />
						<textarea
							v-model="agencyComment"
							rows="3"
							placeholder="What's working well? What could be better? (optional)"
							class="glass-field w-full rounded-2xl px-4 py-2.5 text-sm resize-none mb-3"
						/>
						<Button size="sm" :disabled="!agencyRating || agencySending" @click="submitAgency">
							<Icon :name="agencySending ? 'lucide:loader-2' : 'lucide:send'" class="w-4 h-4 mr-1.5" :class="{ 'animate-spin': agencySending }" />
							Send private feedback
						</Button>
					</template>
					<div v-else class="flex items-center gap-2 py-3 text-sm text-success">
						<Icon name="lucide:check-circle-2" class="w-5 h-5" />
						Sent — thank you.
					</div>
				</div>

				<!-- ── 2. Rate Earnest ─────────────────────────────────── -->
				<div class="ios-card p-5">
					<h2 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 flex items-center gap-2">
						<Icon name="lucide:star" class="w-3.5 h-3.5" />
						Rate Earnest
					</h2>
					<p class="text-xs text-muted-foreground mb-4">
						How's the platform itself? Your review helps us improve.
					</p>

					<template v-if="!earnestDone">
						<PortalStarInput v-model="earnestRating" class="mb-3" />
						<textarea
							v-model="earnestQuote"
							rows="3"
							placeholder="Tell us what you think of Earnest…"
							class="glass-field w-full rounded-2xl px-4 py-2.5 text-sm resize-none mb-3"
						/>
						<label class="flex items-center gap-2 text-xs text-muted-foreground mb-4 cursor-pointer select-none">
							<input v-model="earnestPublic" type="checkbox" class="rounded accent-primary" />
							Let Earnest share this publicly (with your name &amp; company)
						</label>
						<Button size="sm" variant="outline" :disabled="!earnestRating || !earnestQuote.trim() || earnestSending" @click="submitEarnest">
							<Icon :name="earnestSending ? 'lucide:loader-2' : 'lucide:star'" class="w-4 h-4 mr-1.5" :class="{ 'animate-spin': earnestSending }" />
							Submit review
						</Button>
					</template>
					<div v-else class="flex items-center gap-2 py-3 text-sm text-success">
						<Icon name="lucide:check-circle-2" class="w-5 h-5" />
						Thank you for the review!
					</div>
				</div>

				<!-- ── 3. Start your own Earnest ───────────────────────── -->
				<div class="ios-card p-5 lg:col-span-2 relative overflow-hidden">
					<div class="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent pointer-events-none" />
					<div class="relative">
						<h2 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 flex items-center gap-2">
							<Icon name="lucide:rocket" class="w-3.5 h-3.5" />
							Run your own business on Earnest
						</h2>
						<p class="text-sm text-foreground/90 max-w-2xl mb-1 mt-2">
							Love working in this portal? Earnest is the platform behind it — projects, invoicing,
							proposals, a branded client portal, and an AI partner, all in one place.
						</p>
						<p class="text-xs text-muted-foreground max-w-2xl mb-4">
							Start your own workspace, or point a colleague our way — we'll take it from there.
						</p>

						<template v-if="!interestDone">
							<div class="flex flex-wrap gap-2">
								<Button size="sm" :disabled="interestSending" @click="expressInterest('own_workspace')">
									<Icon name="lucide:sparkles" class="w-4 h-4 mr-1.5" />
									I want my own Earnest
								</Button>
								<Button size="sm" variant="outline" :disabled="interestSending" @click="expressInterest('referral')">
									<Icon name="lucide:users" class="w-4 h-4 mr-1.5" />
									Refer a colleague
								</Button>
								<a href="https://earnest.guru" target="_blank" rel="noopener">
									<Button size="sm" variant="ghost">
										Learn more
										<Icon name="lucide:arrow-up-right" class="w-4 h-4 ml-1" />
									</Button>
								</a>
							</div>
						</template>
						<div v-else class="flex items-center gap-2 py-1 text-sm text-success">
							<Icon name="lucide:check-circle-2" class="w-5 h-5" />
							Thanks — we'll be in touch.
						</div>
					</div>
				</div>
			</div>
		</LayoutPageContainer>
	</div>
</template>
