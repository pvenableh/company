<template>
	<div class="ios-card overflow-hidden">
		<button
			type="button"
			class="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
			@click="open = !open"
		>
			<div class="flex items-center gap-2">
				<div class="w-7 h-7 rounded-full bg-fuchsia-500/10 flex items-center justify-center">
					<EarnestIcon class="w-3.5 h-3.5 text-fuchsia-500" />
				</div>
				<span class="text-sm font-semibold text-foreground">Earnest Recommends</span>
				<span
					v-if="recsByPlatform.length === 0 && recommendations.length > 0"
					class="text-[10px] text-muted-foreground"
				>
					{{ recommendations.length }} {{ recommendations.length === 1 ? 'tip' : 'tips' }}
				</span>
				<span
					v-else-if="errorCount > 0"
					class="text-[10px] inline-flex items-center gap-1 text-destructive font-medium"
				>
					<Icon name="lucide:alert-circle" class="w-3 h-3" />
					{{ errorCount }} blocking
				</span>
				<span
					v-else-if="warnCount > 0"
					class="text-[10px] inline-flex items-center gap-1 text-warning font-medium"
				>
					<Icon name="lucide:alert-triangle" class="w-3 h-3" />
					{{ warnCount }} to fix
				</span>
				<span
					v-else-if="recommendations.length === 0 && platforms.length > 0"
					class="text-[10px] inline-flex items-center gap-1 text-success font-medium"
				>
					<Icon name="lucide:check-circle-2" class="w-3 h-3" />
					Looks good
				</span>
			</div>
			<Icon
				name="lucide:chevron-down"
				class="w-4 h-4 text-muted-foreground transition-transform"
				:class="{ 'rotate-180': open }"
			/>
		</button>

		<div v-if="open" class="px-4 pb-4 pt-2 space-y-4 border-t border-border/30">
			<!-- Quick AI re-suggest button -->
			<button
				v-if="hasCaption || platforms.length > 0"
				type="button"
				class="w-full inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-[11px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
				:disabled="aiLoading || platforms.length === 0"
				@click="$emit('ai-recommend')"
			>
				<Icon
					:name="aiLoading ? 'lucide:loader-2' : 'lucide:wand'"
					class="w-3.5 h-3.5"
					:class="{ 'animate-spin': aiLoading }"
				/>
				{{ aiLoading ? 'Earnest is thinking…' : 'Improve with Earnest AI' }}
			</button>

			<!-- Recommendations list -->
			<div v-if="recommendations.length > 0" class="space-y-2">
				<div
					v-for="rec in recommendations"
					:key="rec.id"
					class="rounded-lg border border-border/40 bg-card/40 p-2.5"
					:class="severityBorder(rec.severity)"
				>
					<div class="flex items-start gap-2">
						<Icon
							:name="severityIcon(rec.severity)"
							class="w-3.5 h-3.5 mt-0.5 shrink-0"
							:class="severityColor(rec.severity)"
						/>
						<div class="flex-1 min-w-0">
							<p class="text-[11px] font-semibold text-foreground leading-snug">
								{{ rec.title }}
							</p>
							<p class="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
								{{ rec.detail }}
							</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Per-platform spec sheets -->
			<div v-if="platforms.length > 0" class="space-y-3">
				<p class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
					Specs &amp; best practices
				</p>
				<div class="space-y-2">
					<div
						v-for="platform in platforms"
						:key="platform"
						class="rounded-lg border border-border/40 bg-card/40 p-3"
					>
						<div class="flex items-center gap-2 mb-2">
							<Icon
								:name="platformIcon(platform)"
								class="w-4 h-4 shrink-0"
							/>
							<span class="text-xs font-semibold text-foreground capitalize">{{ platform }}</span>
							<span
								v-if="postSpec(platform)"
								class="text-[10px] text-muted-foreground ml-auto"
							>
								{{ postType }}
							</span>
						</div>
						<div v-if="postSpec(platform)" class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
							<div>
								<p class="text-muted-foreground">Dimensions</p>
								<p class="font-medium text-foreground tabular-nums">{{ postSpec(platform)?.dimensions }}</p>
							</div>
							<div>
								<p class="text-muted-foreground">Aspect ratio</p>
								<p class="font-medium text-foreground">{{ postSpec(platform)?.aspectRatio }}</p>
							</div>
							<div v-if="postSpec(platform)?.maxDurationSeconds">
								<p class="text-muted-foreground">Max duration</p>
								<p class="font-medium text-foreground tabular-nums">{{ postSpec(platform)?.maxDurationSeconds }}s</p>
							</div>
							<div>
								<p class="text-muted-foreground">Hashtags</p>
								<p class="font-medium text-foreground tabular-nums">
									{{ PLATFORM_SPECS[platform].hashtagRange.min }}–{{ PLATFORM_SPECS[platform].hashtagRange.max }} <span class="text-muted-foreground">(≈{{ PLATFORM_SPECS[platform].hashtagRange.ideal }})</span>
								</p>
							</div>
						</div>
						<p
							v-if="postSpec(platform)?.notes"
							class="text-[10px] text-muted-foreground mt-2 leading-relaxed"
						>
							{{ postSpec(platform)?.notes }}
						</p>
						<p class="text-[10px] text-muted-foreground mt-2 leading-relaxed">
							<Icon name="lucide:clock" class="w-2.5 h-2.5 inline-block mr-0.5" />
							{{ PLATFORM_SPECS[platform].bestPostingTimes }}
						</p>
					</div>
				</div>
			</div>

			<div v-if="platforms.length === 0" class="text-[11px] text-muted-foreground text-center py-3">
				Pick at least one account to see platform-specific recommendations.
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { SocialPlatform, PostType } from '~~/shared/social';
import {
	PLATFORM_SPECS,
	analyzePostDraft,
	type PostRecommendation,
	type RecSeverity,
} from '~~/shared/social-platform-specs';

const props = withDefaults(
	defineProps<{
		caption: string;
		mediaCount: number;
		mediaTypes: ('image' | 'video')[];
		postType: PostType;
		platforms: SocialPlatform[];
		ctaUrl?: string;
		ctaLabel?: string;
		scheduledAt?: string;
		aiLoading?: boolean;
	}>(),
	{
		ctaUrl: '',
		ctaLabel: '',
		aiLoading: false,
	},
);

defineEmits<{ (e: 'ai-recommend'): void }>();

const open = ref(true);

const hasCaption = computed(() => props.caption.trim().length > 0);

const recommendations = computed<PostRecommendation[]>(() =>
	analyzePostDraft({
		caption: props.caption,
		mediaCount: props.mediaCount,
		mediaTypes: props.mediaTypes,
		postType: props.postType,
		platforms: props.platforms,
		ctaUrl: props.ctaUrl,
		ctaLabel: props.ctaLabel,
		scheduledAt: props.scheduledAt,
	}),
);

const recsByPlatform = computed(() => recommendations.value.filter(r => r.platform));
const errorCount = computed(() => recommendations.value.filter(r => r.severity === 'error').length);
const warnCount = computed(() => recommendations.value.filter(r => r.severity === 'warn').length);

function postSpec(p: SocialPlatform) {
	const platformSpec = PLATFORM_SPECS[p];
	return platformSpec.postTypes[props.postType];
}

function severityIcon(s: RecSeverity): string {
	if (s === 'error') return 'lucide:alert-circle';
	if (s === 'warn') return 'lucide:alert-triangle';
	return 'lucide:lightbulb';
}

function severityColor(s: RecSeverity): string {
	if (s === 'error') return 'text-destructive';
	if (s === 'warn') return 'text-warning';
	return 'text-info';
}

function severityBorder(s: RecSeverity): string {
	if (s === 'error') return 'border-destructive/20 bg-destructive/5';
	if (s === 'warn') return 'border-warning/20 bg-warning/5';
	return '';
}

import { getSocialPlatformIcon } from '~/utils/icons';

function platformIcon(p: SocialPlatform): string {
	return getSocialPlatformIcon(p);
}
</script>
