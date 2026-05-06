<script setup lang="ts">
/**
 * Marketing timeline — Clean Gantt across the next/prev 30 days.
 * Rows: Email, LinkedIn, Instagram, Twitter (+ rows are skipped if empty).
 * Bars: marketing_touches positioned by scheduled_for, coloured per campaign.
 * Now-line splits past (with engagement chips) from future (scheduled).
 *
 * Click a bar → side drawer with the touch body and any engagement.
 */
import { format, parseISO } from 'date-fns';

useHead({ title: 'Marketing timeline | Earnest' });

const { selectedOrg } = useOrganization();

interface Touch {
	id: number;
	campaign: number | null;
	sequence_index: number;
	kind: 'email' | 'social';
	audience_target: string;
	audience_filter: string;
	send_offset_hours: number;
	scheduled_for: string | null;
	sent_at: string | null;
	status: string;
	email_subject: string | null;
	email_preview_text: string | null;
	email_body_markdown: string | null;
	email_cta: string | null;
	social_channel: 'linkedin' | 'instagram' | 'twitter' | null;
	social_caption: string | null;
	social_image_brief: string | null;
	opens_count: number | null;
	clicks_count: number | null;
	replies_count: number | null;
}
interface Campaign {
	id: number;
	title: string;
	card_type: string | null;
	status: string;
	goal: string | null;
}
interface TimelineResponse {
	windowStart: string;
	windowEnd: string;
	touches: Touch[];
	campaigns: Campaign[];
}

const data = ref<TimelineResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedTouch = ref<Touch | null>(null);

async function load() {
	const orgId = selectedOrg.value;
	if (!orgId) {
		data.value = null;
		return;
	}
	loading.value = true;
	error.value = null;
	try {
		const res = await $fetch<TimelineResponse>('/api/marketing/timeline', {
			query: { organizationId: orgId },
		});
		data.value = res;
	} catch (err: any) {
		error.value = err?.data?.message || err?.message || 'Failed to load timeline.';
		data.value = null;
	} finally {
		loading.value = false;
	}
}

watch(selectedOrg, load, { immediate: true });

// ── Layout constants ──
const LABEL_WIDTH = 120;
const ROW_HEIGHT = 36;
const DAY_WIDTH = 36; // px per day (60 days × 36 = 2160px wide)
const HEADER_HEIGHT = 28;

// ── Derived ──
const channels: Array<{ key: 'email' | 'linkedin' | 'instagram' | 'twitter'; label: string; icon: string }> = [
	{ key: 'email', label: 'Email', icon: 'lucide:mail' },
	{ key: 'linkedin', label: 'LinkedIn', icon: 'logos:linkedin-icon' },
	{ key: 'instagram', label: 'Instagram', icon: 'logos:instagram-icon' },
	{ key: 'twitter', label: 'Twitter', icon: 'logos:x' },
];

const visibleChannels = computed(() => {
	const present = new Set<string>();
	for (const t of data.value?.touches || []) {
		if (t.kind === 'email') present.add('email');
		if (t.kind === 'social' && t.social_channel) present.add(t.social_channel);
	}
	const filtered = channels.filter((c) => present.has(c.key));
	// Always render Email + at least one social row even when empty so the
	// page doesn't collapse to nothing.
	return filtered.length > 0 ? filtered : [channels[0]!, channels[1]!];
});

const windowStartDate = computed(() => data.value?.windowStart ? new Date(data.value.windowStart) : new Date());
const windowEndDate = computed(() => data.value?.windowEnd ? new Date(data.value.windowEnd) : new Date());
const totalDays = computed(() => {
	const ms = windowEndDate.value.getTime() - windowStartDate.value.getTime();
	return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
});
const trackWidth = computed(() => totalDays.value * DAY_WIDTH);

const daySlots = computed(() => {
	const slots: { x: number; date: Date; isFirstOfMonth: boolean; weekday: string; day: number; isToday: boolean }[] = [];
	const today = new Date(); today.setHours(0, 0, 0, 0);
	for (let i = 0; i < totalDays.value; i++) {
		const d = new Date(windowStartDate.value);
		d.setDate(d.getDate() + i);
		d.setHours(0, 0, 0, 0);
		slots.push({
			x: i * DAY_WIDTH,
			date: d,
			isFirstOfMonth: d.getDate() === 1,
			weekday: format(d, 'EEEEE'),
			day: d.getDate(),
			isToday: d.getTime() === today.getTime(),
		});
	}
	return slots;
});

const nowX = computed(() => {
	const now = Date.now();
	const start = windowStartDate.value.getTime();
	const days = (now - start) / (1000 * 60 * 60 * 24);
	if (days < 0 || days > totalDays.value) return null;
	return days * DAY_WIDTH;
});

const campaignColors = ['#06b6d4', '#f59e0b', '#10b981', '#a855f7', '#ec4899', '#3b82f6', '#f97316', '#84cc16'];
const campaignsById = computed(() => {
	const map = new Map<number, { campaign: Campaign; color: string }>();
	(data.value?.campaigns || []).forEach((c, i) => {
		map.set(c.id, { campaign: c, color: campaignColors[i % campaignColors.length]! });
	});
	return map;
});

function touchChannel(t: Touch): 'email' | 'linkedin' | 'instagram' | 'twitter' | null {
	if (t.kind === 'email') return 'email';
	return t.social_channel || null;
}

function touchTime(t: Touch): Date | null {
	const iso = t.sent_at || t.scheduled_for;
	return iso ? new Date(iso) : null;
}

function touchX(t: Touch): number | null {
	const time = touchTime(t);
	if (!time) return null;
	const days = (time.getTime() - windowStartDate.value.getTime()) / (1000 * 60 * 60 * 24);
	if (days < 0 || days > totalDays.value) return null;
	return days * DAY_WIDTH;
}

const rows = computed(() => {
	return visibleChannels.value.map((ch) => {
		const items = (data.value?.touches || [])
			.filter((t) => touchChannel(t) === ch.key)
			.map((t) => {
				const x = touchX(t);
				if (x === null) return null;
				const meta = t.campaign ? campaignsById.value.get(t.campaign) : null;
				return { touch: t, x, color: meta?.color || '#6366f1', campaign: meta?.campaign || null };
			})
			.filter(Boolean) as Array<{ touch: Touch; x: number; color: string; campaign: Campaign | null }>;
		return { channel: ch, items };
	});
});

function statusOpacity(status: string): number {
	switch (status) {
		case 'sent': return 1;
		case 'scheduled': return 0.55;
		case 'cancelled':
		case 'failed': return 0.25;
		default: return 0.4;
	}
}

function tooltipFor(touch: Touch, campaign: Campaign | null): string {
	const parts: string[] = [];
	if (campaign?.title) parts.push(campaign.title);
	if (touch.kind === 'email' && touch.email_subject) parts.push(`"${touch.email_subject}"`);
	if (touch.kind === 'social' && touch.social_caption) parts.push(`${touch.social_channel}: ${touch.social_caption.slice(0, 60)}…`);
	const time = touchTime(touch);
	if (time) parts.push(format(time, 'MMM d, h:mma'));
	parts.push(`status: ${touch.status}`);
	if (touch.opens_count) parts.push(`${touch.opens_count} opens`);
	if (touch.clicks_count) parts.push(`${touch.clicks_count} clicks`);
	return parts.join(' · ');
}

function openTouch(touch: Touch) {
	selectedTouch.value = touch;
}

function closeTouch() {
	selectedTouch.value = null;
}

const selectedCampaign = computed(() => {
	if (!selectedTouch.value?.campaign) return null;
	return campaignsById.value.get(selectedTouch.value.campaign)?.campaign || null;
});

const totalCount = computed(() => (data.value?.touches || []).length);
const sentCount = computed(() => (data.value?.touches || []).filter((t) => t.status === 'sent').length);
const scheduledCount = computed(() => (data.value?.touches || []).filter((t) => t.status === 'scheduled').length);

const ganttScroll = ref<HTMLElement | null>(null);
function scrollToNow() {
	nextTick(() => {
		if (!ganttScroll.value || nowX.value === null) return;
		const containerWidth = ganttScroll.value.clientWidth;
		const target = LABEL_WIDTH + nowX.value - containerWidth / 4;
		ganttScroll.value.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
	});
}
watch(() => totalCount.value, scrollToNow);
</script>

<template>
	<div class="min-h-screen bg-background">
		<header class="px-6 sm:px-10 pt-8 pb-4 max-w-screen-2xl mx-auto">
			<div class="flex items-end justify-between gap-4">
				<div>
					<h1
						class="text-2xl font-semibold text-foreground"
						style="text-transform: none; letter-spacing: -0.01em;"
					>
						Marketing timeline
					</h1>
					<p class="text-xs text-muted-foreground mt-1">
						Past 30 days · Next 30 days · Coloured by campaign
					</p>
				</div>
				<div class="flex items-center gap-3 text-xs text-muted-foreground">
					<span class="inline-flex items-center gap-1.5">
						<span class="w-2 h-2 rounded-full bg-foreground/50 opacity-100" />
						Sent ({{ sentCount }})
					</span>
					<span class="inline-flex items-center gap-1.5">
						<span class="w-2 h-2 rounded-full bg-foreground/50 opacity-55" />
						Scheduled ({{ scheduledCount }})
					</span>
					<NuxtLink
						to="/marketing"
						class="ml-3 text-xs font-medium text-primary hover:underline"
					>
						← Back to feed
					</NuxtLink>
				</div>
			</div>
		</header>

		<section class="px-6 sm:px-10 pb-12 max-w-screen-2xl mx-auto">
			<div v-if="loading" class="text-sm text-muted-foreground py-12">Loading timeline…</div>
			<div v-else-if="error" class="text-sm text-red-600 py-12">{{ error }}</div>
			<div
				v-else-if="totalCount === 0"
				class="text-sm text-muted-foreground py-12 text-center border border-dashed border-border/50 rounded-2xl"
			>
				<p>Nothing scheduled yet.</p>
				<p class="text-xs mt-1">
					Schedule a campaign from the
					<NuxtLink to="/marketing" class="text-primary hover:underline">marketing feed</NuxtLink>
					and it will appear here.
				</p>
			</div>

			<div
				v-else
				ref="ganttScroll"
				class="ios-card overflow-x-auto overflow-y-hidden"
				style="-ms-overflow-style: none; scrollbar-width: none;"
			>
				<div
					class="relative"
					:style="{ width: `${LABEL_WIDTH + trackWidth}px`, minHeight: `${HEADER_HEIGHT + rows.length * ROW_HEIGHT + 8}px` }"
				>
					<!-- Header: month / day axis -->
					<div
						class="sticky top-0 bg-background z-10 border-b border-border/30 flex"
						:style="{ height: `${HEADER_HEIGHT}px` }"
					>
						<div :style="{ width: `${LABEL_WIDTH}px`, minWidth: `${LABEL_WIDTH}px` }" />
						<div class="relative" :style="{ width: `${trackWidth}px` }">
							<div
								v-for="slot in daySlots"
								:key="slot.date.toISOString()"
								class="absolute top-0 text-[9px] flex flex-col items-center justify-start pt-1"
								:style="{
									left: `${slot.x}px`,
									width: `${DAY_WIDTH}px`,
									color: slot.isToday ? 'var(--primary, #6366f1)' : undefined,
								}"
							>
								<span
									v-if="slot.isFirstOfMonth"
									class="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground/80 leading-none"
								>
									{{ format(slot.date, 'MMM') }}
								</span>
								<span class="text-[10px] font-medium leading-none mt-0.5" :class="{ 'font-bold': slot.isToday }">
									{{ slot.day }}
								</span>
							</div>
						</div>
					</div>

					<!-- Vertical day grid -->
					<div
						v-for="slot in daySlots"
						:key="`grid-${slot.date.toISOString()}`"
						class="absolute top-0 border-r border-border/10"
						:style="{
							left: `${LABEL_WIDTH + slot.x}px`,
							width: `${DAY_WIDTH}px`,
							height: `${HEADER_HEIGHT + rows.length * ROW_HEIGHT}px`,
						}"
					/>

					<!-- Channel rows -->
					<div
						v-for="(row, i) in rows"
						:key="row.channel.key"
						class="relative flex"
						:style="{ height: `${ROW_HEIGHT}px`, top: `${HEADER_HEIGHT + i * ROW_HEIGHT}px`, position: 'absolute', width: '100%' }"
					>
						<!-- Sticky label -->
						<div
							class="sticky left-0 bg-background z-10 flex items-center gap-2 px-3 border-r border-border/30"
							:style="{ width: `${LABEL_WIDTH}px`, minWidth: `${LABEL_WIDTH}px`, height: `${ROW_HEIGHT}px` }"
						>
							<Icon :name="row.channel.icon" class="w-4 h-4 rounded-sm shrink-0" />
							<span class="text-[11px] font-medium text-foreground">{{ row.channel.label }}</span>
							<span class="ml-auto text-[10px] text-muted-foreground">{{ row.items.length }}</span>
						</div>

						<!-- Track -->
						<div class="relative" :style="{ width: `${trackWidth}px`, height: `${ROW_HEIGHT}px` }">
							<button
								v-for="item in row.items"
								:key="item.touch.id"
								class="absolute rounded-md hover:scale-110 transition-transform"
								:title="tooltipFor(item.touch, item.campaign)"
								:style="{
									left: `${item.x - 6}px`,
									top: `${(ROW_HEIGHT - 12) / 2}px`,
									width: '12px',
									height: '12px',
									backgroundColor: item.color,
									opacity: statusOpacity(item.touch.status),
								}"
								@click="openTouch(item.touch)"
							/>
						</div>
					</div>

					<!-- Now line -->
					<div
						v-if="nowX !== null"
						class="absolute top-0 w-px bg-primary z-5"
						:style="{
							left: `${LABEL_WIDTH + nowX}px`,
							height: `${HEADER_HEIGHT + rows.length * ROW_HEIGHT}px`,
						}"
					>
						<span class="absolute -top-3 -left-2 w-1.5 h-1.5 rounded-full bg-primary" />
					</div>
				</div>
			</div>

			<!-- Touch detail drawer -->
			<Sheet v-if="selectedTouch" :open="true" @update:open="(v) => !v && closeTouch()">
				<SheetContent
					side="right"
					class="w-[480px] sm:max-w-[480px] flex flex-col p-0 gap-0"
				>
					<header class="px-6 pt-5 pb-4 border-b border-border/60">
						<SheetTitle
							class="text-base font-semibold"
							style="text-transform: none; letter-spacing: -0.01em;"
						>
							{{ selectedTouch.email_subject || (selectedTouch.social_channel || 'Touch') + ' post' }}
						</SheetTitle>
						<SheetDescription
							v-if="selectedCampaign"
							class="text-xs text-muted-foreground mt-1 normal-case"
						>
							{{ selectedCampaign.title }}
						</SheetDescription>
					</header>

					<div class="flex-1 overflow-auto px-6 py-4 space-y-4 text-sm">
						<div class="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
							<span>{{ selectedTouch.kind }}</span>
							<span>·</span>
							<span>{{ selectedTouch.status }}</span>
							<span v-if="selectedTouch.scheduled_for">·</span>
							<span v-if="selectedTouch.scheduled_for">
								{{ format(parseISO(selectedTouch.scheduled_for), 'MMM d, h:mma') }}
							</span>
						</div>

						<template v-if="selectedTouch.kind === 'email'">
							<div v-if="selectedTouch.email_preview_text" class="text-xs italic text-muted-foreground">
								{{ selectedTouch.email_preview_text }}
							</div>
							<pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed">{{ selectedTouch.email_body_markdown }}</pre>
							<div v-if="selectedTouch.email_cta" class="text-[10px] uppercase tracking-wider text-muted-foreground">
								CTA: {{ selectedTouch.email_cta }}
							</div>
						</template>

						<template v-if="selectedTouch.kind === 'social'">
							<div v-if="selectedTouch.social_image_brief" class="text-xs text-muted-foreground border border-border/40 rounded-lg p-3">
								<div class="text-[10px] uppercase tracking-wider mb-1">Image brief</div>
								{{ selectedTouch.social_image_brief }}
							</div>
							<pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed">{{ selectedTouch.social_caption }}</pre>
						</template>

						<div
							v-if="selectedTouch.opens_count || selectedTouch.clicks_count || selectedTouch.replies_count"
							class="flex flex-wrap gap-3 text-xs text-muted-foreground border-t border-border/30 pt-4"
						>
							<span v-if="selectedTouch.opens_count">{{ selectedTouch.opens_count }} opens</span>
							<span v-if="selectedTouch.clicks_count">{{ selectedTouch.clicks_count }} clicks</span>
							<span v-if="selectedTouch.replies_count">{{ selectedTouch.replies_count }} replies</span>
						</div>
					</div>
				</SheetContent>
			</Sheet>
		</section>
	</div>
</template>

<style scoped>
.ios-card::-webkit-scrollbar { display: none; }
</style>
