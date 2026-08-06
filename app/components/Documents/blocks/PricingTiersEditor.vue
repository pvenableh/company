<script setup lang="ts">
/**
 * pricing_tiers — side-by-side option cards. Drives both the Hue HUE-605
 * "cost." packages and classic Good/Better/Best proposal pricing.
 */
import type { PricingTiersPayload, PricingTier } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: PricingTiersPayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: PricingTiersPayload];
}>();

function uid(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `tier_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const payload = computed<PricingTiersPayload>(() => ({
	heading: props.modelValue?.heading ?? '',
	tiers: Array.isArray(props.modelValue?.tiers) ? props.modelValue.tiers : [],
}));

function patch(p: Partial<PricingTiersPayload>) {
	emit('update:modelValue', { ...payload.value, ...p });
}
function setTiers(tiers: PricingTier[]) {
	patch({ tiers });
}
function addTier() {
	setTiers([...payload.value.tiers, { id: uid(), name: '', price: '', price_note: '', description: '', features: [''], featured: false, cta: '' }]);
}
function removeTier(i: number) {
	setTiers(payload.value.tiers.filter((_, idx) => idx !== i));
}
function updateTier(i: number, p: Partial<PricingTier>) {
	setTiers(payload.value.tiers.map((t, idx) => (idx === i ? { ...t, ...p } : t)));
}
function updateFeature(i: number, fi: number, value: string) {
	const features = payload.value.tiers[i].features.slice();
	features[fi] = value;
	updateTier(i, { features });
}
function addFeature(i: number) {
	updateTier(i, { features: [...payload.value.tiers[i].features, ''] });
}
function removeFeature(i: number, fi: number) {
	updateTier(i, { features: payload.value.tiers[i].features.filter((_, idx) => idx !== fi) });
}
function onFeatureKeydown(e: KeyboardEvent, i: number, fi: number) {
	if (e.key === 'Enter') {
		e.preventDefault();
		const features = payload.value.tiers[i].features.slice();
		features.splice(fi + 1, 0, '');
		updateTier(i, { features });
	} else if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '' && payload.value.tiers[i].features.length > 1) {
		e.preventDefault();
		removeFeature(i, fi);
	}
}
</script>

<template>
	<div class="space-y-2">
		<input
			:value="payload.heading || ''"
			placeholder="Section heading (optional) — e.g. cost."
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm font-semibold"
			@input="patch({ heading: ($event.target as HTMLInputElement).value })"
		/>

		<div v-for="(tier, i) in payload.tiers" :key="tier.id" class="rounded-lg border border-border p-2 space-y-1.5">
			<div class="flex items-center gap-2">
				<input
					:value="tier.name"
					placeholder="Tier name — e.g. Identity + Web"
					class="flex-1 bg-transparent border-0 outline-none text-sm font-semibold"
					@input="updateTier(i, { name: ($event.target as HTMLInputElement).value })"
				/>
				<label class="text-[10px] inline-flex items-center gap-1 text-muted-foreground">
					<input type="checkbox" :checked="!!tier.featured" @change="updateTier(i, { featured: ($event.target as HTMLInputElement).checked })" />
					Featured
				</label>
				<button class="p-1 rounded hover:bg-destructive/10 text-destructive" title="Remove tier" @click="removeTier(i)">
					<EIcon name="lucide:trash-2" class="w-3.5 h-3.5" />
				</button>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<input
					:value="tier.price || ''"
					placeholder="Price — e.g. $15,550"
					class="bg-transparent border-b border-border outline-none text-sm py-0.5"
					@input="updateTier(i, { price: ($event.target as HTMLInputElement).value })"
				/>
				<input
					:value="tier.price_note || ''"
					placeholder="Price note — e.g. 8 weeks"
					class="bg-transparent border-b border-border outline-none text-sm py-0.5 text-muted-foreground"
					@input="updateTier(i, { price_note: ($event.target as HTMLInputElement).value })"
				/>
			</div>
			<textarea
				:value="tier.description || ''"
				placeholder="Description (optional)"
				rows="2"
				class="w-full bg-transparent border-0 outline-none resize-y text-sm text-muted-foreground"
				@input="updateTier(i, { description: ($event.target as HTMLTextAreaElement).value })"
			/>
			<ul class="space-y-1 pl-1">
				<li v-for="(feat, fi) in tier.features" :key="fi" class="flex items-center gap-1.5 group/feat">
					<EIcon name="lucide:check" class="w-3.5 h-3.5 text-muted-foreground" />
					<input
						:value="feat"
						placeholder="Feature"
						class="flex-1 bg-transparent border-0 outline-none text-sm"
						@input="updateFeature(i, fi, ($event.target as HTMLInputElement).value)"
						@keydown="onFeatureKeydown($event, i, fi)"
					/>
					<button class="p-0.5 rounded hover:bg-destructive/10 text-destructive opacity-0 group-hover/feat:opacity-100" @click="removeFeature(i, fi)">
						<EIcon name="lucide:x" class="w-3.5 h-3.5" />
					</button>
				</li>
			</ul>
			<div class="flex items-center justify-between">
				<button class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" @click="addFeature(i)">
					<EIcon name="lucide:plus" class="w-3.5 h-3.5" /> Add feature
				</button>
				<input
					:value="tier.cta || ''"
					placeholder="CTA label (optional)"
					class="bg-transparent border-b border-border outline-none text-xs py-0.5 w-32 text-right"
					@input="updateTier(i, { cta: ($event.target as HTMLInputElement).value })"
				/>
			</div>
		</div>

		<button
			class="w-full rounded-lg border-2 border-dashed border-border p-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5"
			@click="addTier"
		>
			<EIcon name="lucide:plus" class="w-3.5 h-3.5" /> Add tier
		</button>
	</div>
</template>
