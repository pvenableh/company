<template>
	<article class="rounded-2xl border bg-card overflow-hidden">
		<!-- Strip header: timing + channel + audience -->
		<header class="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/30">
			<div class="flex items-center gap-2 text-[11px] text-muted-foreground">
				<Icon :name="kindIcon" class="w-3.5 h-3.5" :class="kindColor" />
				<span class="font-medium text-foreground/80">{{ timingLabel }}</span>
				<span class="text-muted-foreground/60">·</span>
				<span>{{ kindLabel }}</span>
				<span class="text-muted-foreground/60">·</span>
				<span>{{ audienceLabel }}</span>
			</div>
			<div class="inline-flex items-center gap-1">
				<button
					v-if="canRestore"
					type="button"
					class="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full hover:bg-background border border-transparent hover:border-border/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
					:disabled="loading || restoring"
					:title="`Restore previous version (${historyCount} ${historyCount === 1 ? 'snapshot' : 'snapshots'} saved)`"
					@click="$emit('restore')"
				>
					<Icon
						:name="restoring ? 'lucide:loader-circle' : 'lucide:undo-2'"
						class="w-3 h-3"
						:class="{ 'animate-spin': restoring }"
					/>
					Undo
				</button>
				<button
					type="button"
					class="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full hover:bg-background border border-transparent hover:border-border/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
					:disabled="loading || restoring"
					@click="$emit('regenerate')"
				>
					<Icon
						:name="loading ? 'lucide:loader-circle' : 'lucide:refresh-ccw'"
						class="w-3 h-3"
						:class="{ 'animate-spin': loading }"
					/>
					{{ loading ? 'Regenerating…' : 'Regenerate' }}
				</button>
			</div>
		</header>

		<!-- Email body -->
		<div v-if="touch.kind === 'email'" class="p-4 space-y-3">
			<div>
				<label class="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
					Subject
				</label>
				<input
					:value="touch.email_subject ?? ''"
					type="text"
					class="w-full bg-transparent border border-border/40 rounded-lg px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-foreground/40 focus:bg-background transition-colors"
					placeholder="Subject line"
					@input="emitUpdate({ email_subject: ($event.target as HTMLInputElement).value })"
				/>
			</div>
			<div>
				<label class="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
					Preview text
				</label>
				<input
					:value="touch.email_preview_text ?? ''"
					type="text"
					class="w-full bg-transparent border border-border/40 rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-foreground/40 focus:bg-background transition-colors"
					placeholder="Inbox preview line"
					@input="emitUpdate({ email_preview_text: ($event.target as HTMLInputElement).value })"
				/>
			</div>
			<div>
				<label class="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
					Body
				</label>
				<textarea
					:value="touch.email_body_markdown ?? ''"
					rows="9"
					class="w-full bg-transparent border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground leading-relaxed font-normal focus:outline-none focus:border-foreground/40 focus:bg-background transition-colors resize-none"
					placeholder="Email body — uses {{first_name}} for personalization"
					@input="emitUpdate({ email_body_markdown: ($event.target as HTMLTextAreaElement).value })"
				/>
			</div>
			<!-- Personalize affordance — only on emails to multiple recipients -->
			<div
				v-if="touch.audience_target !== 'project_contact'"
				class="flex items-center justify-between rounded-lg border border-dashed border-border/60 px-3 py-2 mt-1"
			>
				<div class="flex items-center gap-2 text-xs text-muted-foreground">
					<Icon name="lucide:users-round" class="w-3.5 h-3.5" />
					<span>{{ personalizeBlurb }}</span>
				</div>
				<button
					type="button"
					class="inline-flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors disabled:opacity-50"
					:class="personalizeButtonClass"
					:disabled="personalizing || personalizationDone"
					@click="$emit('personalize')"
				>
					<Icon
						:name="personalizeIcon"
						class="w-3 h-3"
						:class="{ 'animate-spin': personalizing }"
					/>
					{{ personalizeLabel }}
				</button>
			</div>
		</div>

		<!-- Social body -->
		<div v-else-if="touch.kind === 'social'" class="p-4 space-y-3">
			<div class="flex gap-3">
				<div
					class="w-24 h-24 shrink-0 rounded-lg border border-dashed border-border bg-muted/30 flex flex-col items-center justify-center text-[10px] text-muted-foreground p-2 text-center"
				>
					<Icon name="lucide:image" class="w-5 h-5 mb-1 text-muted-foreground/60" />
					<span>Image brief</span>
				</div>
				<div class="flex-1 min-w-0">
					<label class="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
						Image description
					</label>
					<textarea
						:value="touch.social_image_brief ?? ''"
						rows="3"
						class="w-full bg-transparent border border-border/40 rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-foreground/40 focus:bg-background transition-colors resize-none"
						placeholder="Describe the image to generate or upload"
						@input="emitUpdate({ social_image_brief: ($event.target as HTMLTextAreaElement).value })"
					/>
				</div>
			</div>
			<div>
				<label class="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
					Caption
				</label>
				<textarea
					:value="touch.social_caption ?? ''"
					rows="6"
					class="w-full bg-transparent border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground leading-relaxed focus:outline-none focus:border-foreground/40 focus:bg-background transition-colors resize-none"
					placeholder="Caption — first line is the feed hook"
					@input="emitUpdate({ social_caption: ($event.target as HTMLTextAreaElement).value })"
				/>
			</div>
		</div>
	</article>
</template>

<script setup lang="ts">
import type { DraftedTouch } from '~/composables/useMarketingDrafts';

const props = defineProps<{
	touch: DraftedTouch;
	sequenceIndex: number;
	loading?: boolean;
	restoring?: boolean;
	personalizing?: boolean;
	personalizationStatus?: {
		state: string;
		total: number;
		completed: number;
		failed: number;
	} | null;
}>();

const emit = defineEmits<{
	(e: 'update', patch: Partial<DraftedTouch>): void;
	(e: 'regenerate'): void;
	(e: 'restore'): void;
	(e: 'personalize'): void;
}>();

const personalizationDone = computed(() => {
	const s = props.personalizationStatus;
	return !!s && s.total > 0 && s.completed === s.total && s.failed === 0;
});

const personalizationInFlight = computed(() => {
	if (props.personalizing) return true;
	const s = props.personalizationStatus;
	return !!s && (s.state === 'in_progress' || s.state === 'requested');
});

const personalizeBlurb = computed(() => {
	const s = props.personalizationStatus;
	if (personalizationInFlight.value && s) {
		const done = s.completed;
		const total = s.total || 0;
		return `Personalizing ${done}/${total} for each recipient…`;
	}
	if (personalizationDone.value && s) {
		return `Personalized for ${s.completed} ${s.completed === 1 ? 'recipient' : 'recipients'}`;
	}
	if (s && s.failed > 0 && s.completed > 0) {
		return `Personalized ${s.completed}/${s.total} (${s.failed} failed — click to retry)`;
	}
	return 'Personalize this email for each recipient using their CRM context';
});

const personalizeIcon = computed(() => {
	if (personalizationInFlight.value) return 'lucide:loader-circle';
	if (personalizationDone.value) return 'lucide:check';
	return 'lucide:zap';
});

const personalizeLabel = computed(() => {
	if (personalizationInFlight.value) return 'Working…';
	if (personalizationDone.value) return 'Done';
	const s = props.personalizationStatus;
	if (s && s.failed > 0) return 'Retry';
	return 'Personalize';
});

const personalizeButtonClass = computed(() => {
	if (personalizationDone.value) return 'bg-success/10 text-success';
	if (personalizationInFlight.value) return 'bg-muted text-muted-foreground';
	return 'bg-primary/10 text-primary hover:bg-primary/15';
});

const historyCount = computed(() => props.touch.regenerate_history?.length ?? 0);
const canRestore = computed(() => historyCount.value > 0);

function emitUpdate(patch: Partial<DraftedTouch>) {
	emit('update', patch);
}

const kindIcon = computed(() => {
	if (props.touch.kind === 'email') return 'lucide:mail';
	switch (props.touch.social_channel) {
		case 'linkedin':
			return 'logos:linkedin-icon';
		case 'instagram':
			return 'logos:instagram-icon';
		case 'twitter':
			return 'logos:x';
		default:
			return 'lucide:share-2';
	}
});

const kindColor = computed(() => {
	if (props.touch.kind === 'email') return 'text-blue-600';
	if (props.touch.social_channel === 'linkedin') return 'text-info';
	if (props.touch.social_channel === 'instagram') return 'text-pink-600';
	return 'text-foreground';
});

const kindLabel = computed(() => {
	if (props.touch.kind === 'email') return 'Email';
	const c = props.touch.social_channel;
	return c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Social';
});

const timingLabel = computed(() => {
	const h = props.touch.send_offset_hours;
	if (h === 0) return 'At launch';
	if (h < 24) return `+${h}h`;
	const days = Math.round(h / 24);
	const dayLabel = days === 1 ? 'day' : 'days';
	return `+${days} ${dayLabel}`;
});

const audienceLabel = computed(() => {
	const t = props.touch.audience_target;
	const f = props.touch.audience_filter;
	if (t === 'project_contact') return 'to recipient';
	if (t === 'public') return 'public post';
	if (f === 'unopened_previous') return 'to non-openers';
	if (f === 'opened_previous') return 'to openers';
	if (typeof f === 'string' && f.startsWith('cluster:')) return `to ${f.split(':')[1]?.replace(/_/g, ' ')}`;
	return 'to audience';
});
</script>
