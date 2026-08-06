<script setup lang="ts">
/**
 * pricing_tiers renderer — responsive option cards. The featured tier gets an
 * accent border; the price is the accent hero value (Hue "cost: $15,550").
 */
import { marked } from 'marked';
import type { PricingTiersPayload, PricingTier } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: PricingTiersPayload;
}>();

marked.setOptions({ gfm: true, breaks: true });

function inline(s: string | null | undefined): string {
	return s ? (marked.parseInline(s) as string) : '';
}

const tiers = computed<PricingTier[]>(() => (Array.isArray(props.payload?.tiers) ? props.payload.tiers : []));
</script>

<template>
	<div class="pricing-tiers">
		<h2 v-if="payload?.heading" class="pricing-tiers__heading">{{ payload.heading }}</h2>
		<div class="pricing-tiers__grid">
			<section
				v-for="tier in tiers"
				:key="tier.id"
				class="pricing-tiers__card"
				:class="{ 'pricing-tiers__card--featured': tier.featured }"
			>
				<p v-if="tier.featured" class="pricing-tiers__badge">Recommended</p>
				<h3 class="pricing-tiers__name">{{ tier.name }}</h3>
				<p v-if="tier.description" class="pricing-tiers__desc" v-html="inline(tier.description)" />
				<div v-if="tier.price" class="pricing-tiers__price">
					<span class="pricing-tiers__amount">{{ tier.price }}</span>
					<span v-if="tier.price_note" class="pricing-tiers__note">{{ tier.price_note }}</span>
				</div>
				<ul v-if="tier.features?.length" class="pricing-tiers__features">
					<li v-for="(feat, fi) in tier.features.filter(Boolean)" :key="fi" v-html="inline(feat)" />
				</ul>
				<p v-if="tier.cta" class="pricing-tiers__cta">{{ tier.cta }}</p>
			</section>
		</div>
	</div>
</template>

<style scoped>
.pricing-tiers__heading {
	font-size: 1.3rem;
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	margin-bottom: 1.25rem;
}
.pricing-tiers__grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	gap: 1.25rem;
}
.pricing-tiers__card {
	border: 1px solid rgba(0, 0, 0, 0.1);
	border-radius: 0.75rem;
	padding: 1.5rem 1.25rem;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	break-inside: avoid;
}
.pricing-tiers__card--featured {
	border-color: var(--doc-accent, hsl(var(--primary)));
	border-width: 2px;
	box-shadow: 0 8px 24px -12px var(--doc-accent, hsl(var(--primary) / 0.4));
}
.pricing-tiers__badge {
	text-transform: uppercase;
	letter-spacing: 0.08em;
	font-size: 0.65rem;
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	margin: 0;
}
.pricing-tiers__name {
	font-size: 1.15rem;
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	margin: 0;
}
.pricing-tiers__desc {
	font-size: 0.85rem;
	opacity: 0.75;
	line-height: 1.5;
	margin: 0;
}
.pricing-tiers__price {
	display: flex;
	align-items: baseline;
	gap: 0.5rem;
	margin: 0.5rem 0;
}
.pricing-tiers__amount {
	font-size: 1.75rem;
	font-weight: 800;
	color: var(--doc-accent, hsl(var(--primary)));
	letter-spacing: -0.01em;
}
.pricing-tiers__note {
	font-size: 0.8rem;
	opacity: 0.6;
}
.pricing-tiers__features {
	list-style: none;
	margin: 0.25rem 0 0;
	padding: 0;
	font-size: 0.88rem;
	line-height: 1.7;
}
.pricing-tiers__features li {
	padding-left: 1.25rem;
	position: relative;
}
.pricing-tiers__features li::before {
	content: '✓';
	position: absolute;
	left: 0;
	color: var(--doc-accent, hsl(var(--primary)));
	font-weight: 700;
}
.pricing-tiers__cta {
	margin-top: auto;
	padding-top: 0.75rem;
	font-weight: 600;
	font-size: 0.9rem;
	color: var(--doc-accent, hsl(var(--primary)));
}

:global(.dark .pricing-tiers__card) { border-color: rgba(255, 255, 255, 0.12); }

@media print {
	.pricing-tiers__card { break-inside: avoid; }
}
</style>
