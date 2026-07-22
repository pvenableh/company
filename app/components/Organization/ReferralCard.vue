<script setup lang="ts">
/**
 * ReferralCard — a subscriber's "refer an agency" surface.
 *
 * Shows the org's shareable referral link (`/register?ref=<orgId>`), a copy
 * button, and what both sides earn. The link brands the recipient's signup as
 * this agency (see pages/register.vue) and, on the referred org's paid
 * conversion, credits both orgs with bonus AI tokens (server/utils/referral-reward.ts).
 */
import { toast } from 'vue-sonner';

const { selectedOrg } = useOrganization();
const { orgName } = useOrgBrand();

// Built client-side from the current origin so it works across environments.
const referralLink = computed(() => {
	if (!import.meta.client || !selectedOrg.value) return '';
	return `${window.location.origin}/register?ref=${selectedOrg.value}`;
});

const copied = ref(false);
async function copyLink() {
	if (!referralLink.value) return;
	try {
		await navigator.clipboard.writeText(referralLink.value);
		copied.value = true;
		toast.success('Referral link copied');
		setTimeout(() => (copied.value = false), 2000);
	} catch {
		toast.error('Could not copy — select and copy the link manually.');
	}
}

async function share() {
	if (!referralLink.value) return;
	const nav = navigator as any;
	if (nav.share) {
		try {
			await nav.share({
				title: 'Try Earnest',
				text: `${orgName.value} runs on Earnest — try it for your agency.`,
				url: referralLink.value,
			});
			return;
		} catch {
			/* user cancelled — fall through to copy */
		}
	}
	copyLink();
}
</script>

<template>
	<div class="ios-card p-6">
		<div class="flex items-start gap-3">
			<div class="flex items-center justify-center size-10 rounded-xl bg-primary/12 text-primary shrink-0">
				<Icon name="lucide:gift" class="w-5 h-5" />
			</div>
			<div class="min-w-0">
				<h2 class="text-base font-semibold text-foreground leading-tight">Refer another agency</h2>
				<p class="text-[13px] text-muted-foreground mt-0.5">
					Share your link. When an agency you refer starts a paid plan,
					<strong class="text-foreground">you both get 100,000 bonus AI credits</strong>.
				</p>
			</div>
		</div>

		<!-- Link + copy -->
		<div class="mt-5 flex items-stretch gap-2">
			<div class="flex-1 min-w-0 flex items-center px-3 rounded-lg border border-border bg-muted/40 text-sm text-foreground font-mono truncate">
				{{ referralLink || 'Select an organization to get your link' }}
			</div>
			<button
				type="button"
				class="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity shrink-0 disabled:opacity-50 ios-press"
				:disabled="!referralLink"
				@click="copyLink"
			>
				<Icon :name="copied ? 'lucide:check' : 'lucide:copy'" class="w-4 h-4" />
				{{ copied ? 'Copied' : 'Copy' }}
			</button>
			<button
				type="button"
				class="inline-flex items-center justify-center size-10 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0 disabled:opacity-50"
				:disabled="!referralLink"
				aria-label="Share referral link"
				@click="share"
			>
				<Icon name="lucide:share-2" class="w-4 h-4" />
			</button>
		</div>

		<!-- How it works -->
		<ol class="mt-5 space-y-2.5">
			<li v-for="(step, i) in [
				'Share your link with another agency owner.',
				'They sign up — their signup is branded as your invite.',
				'When they go paid, you both get 100K bonus AI credits.',
			]" :key="i" class="flex items-center gap-3 text-[13px] text-muted-foreground">
				<span class="flex items-center justify-center size-6 rounded-full bg-muted/60 text-foreground text-[11px] font-semibold tabular-nums shrink-0">
					{{ i + 1 }}
				</span>
				{{ step }}
			</li>
		</ol>
	</div>
</template>
