<script setup lang="ts">
/**
 * PortalCsatRating — one shared client-satisfaction widget for the portal.
 *
 * Mounts on a resolved ticket / completed project. Until the work is
 * delivered it renders nothing. When delivered and unrated it shows a
 * 1–5 star picker + optional note; once submitted it shows a compact
 * "thanks, you rated ★★★★☆" state (with a discreet change-rating link).
 *
 * Writes go through POST /api/portal/csat (scope-checked, admin token), so
 * the portal user never needs write-perm on tickets/projects.
 */
const props = defineProps<{
	collection: 'tickets' | 'projects';
	itemId: string;
	status?: string | null;
	rating?: number | null;
	comment?: string | null;
	submittedAt?: string | null;
}>();

const emit = defineEmits<{
	submitted: [{ rating: number; comment: string | null; submitted_at: string }];
}>();

const toast = useToast();

const DELIVERED: Record<'tickets' | 'projects', string> = {
	tickets: 'Completed',
	projects: 'completed',
};
const isDelivered = computed(() => props.status === DELIVERED[props.collection]);

// Local, editable copies so the widget flips to the "rated" state instantly.
const savedRating = ref<number | null>(props.rating ?? null);
const savedComment = ref<string | null>(props.comment ?? null);
const savedAt = ref<string | null>(props.submittedAt ?? null);
watch(
	() => [props.rating, props.comment, props.submittedAt],
	([r, c, s]) => {
		savedRating.value = (r as number) ?? null;
		savedComment.value = (c as string) ?? null;
		savedAt.value = (s as string) ?? null;
	},
);

const hasRated = computed(() => !!savedAt.value && !!savedRating.value);
const editing = ref(false);

const draftRating = ref(0);
const hoverRating = ref(0);
const draftComment = ref('');
const busy = ref(false);

const displayStars = computed(() => hoverRating.value || draftRating.value);

function beginEdit() {
	draftRating.value = savedRating.value ?? 0;
	draftComment.value = savedComment.value ?? '';
	editing.value = true;
}

const noun = computed(() => (props.collection === 'tickets' ? 'ticket' : 'project'));

async function submit() {
	if (!draftRating.value || busy.value) return;
	busy.value = true;
	try {
		const res = await $fetch<any>('/api/portal/csat', {
			method: 'POST',
			body: {
				collection: props.collection,
				itemId: props.itemId,
				rating: draftRating.value,
				comment: draftComment.value.trim() || undefined,
			},
		});
		savedRating.value = draftRating.value;
		savedComment.value = draftComment.value.trim() || null;
		savedAt.value = res?.data?.csat_submitted_at || new Date().toISOString();
		editing.value = false;
		toast.add({ title: 'Thanks for the feedback!', icon: 'i-heroicons-heart', color: 'success' });
		emit('submitted', { rating: savedRating.value!, comment: savedComment.value, submitted_at: savedAt.value! });
	} catch (err: any) {
		toast.add({
			title: 'Could not submit rating',
			description: err?.data?.message || err?.message || 'Please try again.',
			icon: 'i-heroicons-exclamation-triangle',
			color: 'error',
		});
	} finally {
		busy.value = false;
	}
}
</script>

<template>
	<div v-if="isDelivered" class="csat">
		<!-- Already rated (and not editing) -->
		<div v-if="hasRated && !editing" class="csat__done">
			<div class="csat__done-head">
				<div class="csat__stars csat__stars--sm" aria-hidden="true">
					<EIcon
						v-for="n in 5"
						:key="n"
						:name="n <= (savedRating || 0) ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
						class="csat__star"
						:class="n <= (savedRating || 0) ? 'text-amber-500' : 'text-muted-foreground/40'"
					/>
				</div>
				<p class="text-sm font-medium text-foreground">Thanks for rating this {{ noun }}</p>
			</div>
			<p v-if="savedComment" class="csat__comment">“{{ savedComment }}”</p>
			<button type="button" class="csat__change" @click="beginEdit">Change rating</button>
		</div>

		<!-- Rate / edit -->
		<div v-else class="csat__form">
			<p class="csat__prompt">
				{{ hasRated ? 'Update your rating' : `How did we do on this ${noun}?` }}
			</p>
			<div class="csat__stars" role="radiogroup" :aria-label="`Rate this ${noun} 1 to 5`">
				<button
					v-for="n in 5"
					:key="n"
					type="button"
					class="csat__star-btn"
					role="radio"
					:aria-checked="draftRating === n"
					:aria-label="`${n} star${n > 1 ? 's' : ''}`"
					@click="draftRating = n"
					@mouseenter="hoverRating = n"
					@mouseleave="hoverRating = 0"
				>
					<EIcon
						:name="n <= displayStars ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
						class="csat__star"
						:class="n <= displayStars ? 'text-amber-500' : 'text-muted-foreground/40'"
					/>
				</button>
			</div>
			<textarea
				v-model="draftComment"
				rows="2"
				maxlength="2000"
				placeholder="Anything you'd like us to know? (optional)"
				class="csat__note"
			/>
			<div class="csat__actions">
				<button
					type="button"
					class="csat__submit"
					:disabled="!draftRating || busy"
					@click="submit"
				>
					<EIcon v-if="busy" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
					<span>{{ busy ? 'Sending…' : 'Submit rating' }}</span>
				</button>
				<button v-if="hasRated" type="button" class="csat__cancel" @click="editing = false">
					Cancel
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.csat {
	@apply rounded-2xl border border-border bg-card p-4;
}
.csat__done-head {
	@apply flex items-center gap-2.5;
}
.csat__stars {
	@apply flex items-center gap-1;
}
.csat__stars--sm .csat__star {
	@apply w-4 h-4;
}
.csat__star {
	@apply w-6 h-6;
}
.csat__star-btn {
	@apply p-0.5 rounded-full transition-transform hover:scale-110 active:scale-95;
}
.csat__comment {
	@apply text-sm text-muted-foreground mt-2 italic;
}
.csat__change {
	@apply text-[11px] font-medium text-primary hover:underline mt-2;
}
.csat__prompt {
	@apply text-sm font-semibold text-foreground mb-2;
}
.csat__note {
	@apply w-full mt-3 rounded-2xl border border-border bg-background px-3 py-2 text-sm
		resize-none focus:outline-none focus:ring-2 focus:ring-primary/40;
}
.csat__actions {
	@apply flex items-center gap-2 mt-3;
}
.csat__submit {
	@apply inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground
		px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity
		disabled:opacity-50 disabled:cursor-not-allowed;
}
.csat__cancel {
	@apply text-xs text-muted-foreground hover:text-foreground px-2;
}
</style>
