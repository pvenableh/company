<template>
	<div class="space-y-4">
		<!-- Timeline header -->
		<div class="flex items-center justify-between">
			<div>
				<h3 class="text-lg font-semibold text-foreground">{{ campaign.campaignName }}</h3>
				<p class="text-sm text-muted-foreground">{{ campaign.objective }}</p>
			</div>
		</div>

		<!-- Week cards -->
		<div class="space-y-3">
			<div
				v-for="week in campaign.timeline"
				:key="week.week"
				class="rounded-xl border overflow-hidden"
			>
				<button
					class="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
					@click="toggleWeek(week.week)"
				>
					<span class="text-sm font-semibold text-foreground">Week {{ week.week }}</span>
					<div class="flex items-center gap-2">
						<span class="text-xs text-muted-foreground">{{ week.activities.length }} activities</span>
						<Icon
							name="lucide:chevron-down"
							class="w-4 h-4 text-muted-foreground transition-transform"
							:class="{ 'rotate-180': expandedWeeks.has(week.week) }"
						/>
					</div>
				</button>

				<div v-if="expandedWeeks.has(week.week)" class="divide-y">
					<div
						v-for="(activity, i) in week.activities"
						:key="i"
						class="flex items-start gap-3 px-4 py-3"
					>
						<div
							class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
							:class="getChannelBg(activity.channel)"
						>
							<Icon :name="getChannelIcon(activity.channel)" class="w-3.5 h-3.5" :class="getChannelColor(activity.channel)" />
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium text-foreground">{{ activity.action }}</span>
								<span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider bg-muted text-muted-foreground">
									{{ activity.channel }}
								</span>
							</div>
							<p class="text-xs text-muted-foreground mt-0.5">{{ activity.details }}</p>
						</div>
						<Button
							v-if="activity.channel === 'social' || activity.channel === 'email'"
							variant="ghost"
							size="sm"
							class="shrink-0 text-xs"
							@click="$emit('create', activity)"
						>
							<Icon name="lucide:plus" class="w-3 h-3 mr-1" />
							Create
						</Button>
					</div>
				</div>
			</div>
		</div>

		<!-- Email sequence -->
		<div v-if="campaign.emailSequence?.length" class="mt-6">
			<h4 class="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
				<Icon name="lucide:mail" class="w-4 h-4 text-blue-500" />
				Email Sequence
			</h4>
			<div class="space-y-2">
				<div
					v-for="email in campaign.emailSequence"
					:key="email.day"
					class="flex items-start gap-3 rounded-lg border px-4 py-3"
				>
					<div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
						<span class="text-xs font-bold text-blue-700 dark:text-blue-300">D{{ email.day }}</span>
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-foreground">{{ email.subject }}</p>
						<p class="text-xs text-muted-foreground mt-0.5">{{ email.keyMessage }}</p>
						<div class="flex items-center gap-3 mt-1.5">
							<span class="text-[10px] text-blue-600 dark:text-blue-400 font-medium">CTA: {{ email.cta }}</span>
							<span class="text-[10px] text-muted-foreground">Segment: {{ email.segment }}</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Social posts -->
		<div v-if="campaign.socialPosts?.length" class="mt-6">
			<h4 class="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
				<Icon name="lucide:share-2" class="w-4 h-4 text-purple-500" />
				Social Posts
			</h4>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
				<div
					v-for="(post, i) in campaign.socialPosts"
					:key="i"
					class="rounded-lg border px-4 py-3"
				>
					<div class="flex items-center gap-2 mb-2">
						<Icon :name="getPlatformIcon(post.platform)" class="w-3.5 h-3.5 text-muted-foreground" />
						<span class="text-xs font-medium text-foreground capitalize">{{ post.platform }}</span>
						<span class="text-[10px] text-muted-foreground ml-auto">{{ post.timing }}</span>
					</div>
					<p class="text-xs text-muted-foreground leading-relaxed line-clamp-3">{{ post.content }}</p>
					<div v-if="post.hashtags?.length" class="flex flex-wrap gap-1 mt-2">
						<span
							v-for="tag in post.hashtags.slice(0, 4)"
							:key="tag"
							class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
						>
							{{ tag }}
						</span>
					</div>
				</div>
			</div>
		</div>

		<!-- KPIs -->
		<div v-if="campaign.kpis?.length" class="mt-6">
			<h4 class="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
				<Icon name="lucide:target" class="w-4 h-4 text-green-500" />
				Key Performance Indicators
			</h4>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
				<div
					v-for="kpi in campaign.kpis"
					:key="kpi.metric"
					class="rounded-lg border px-4 py-3"
				>
					<div class="text-sm font-medium text-foreground">{{ kpi.metric }}</div>
					<div class="text-lg font-bold text-foreground mt-0.5">{{ kpi.target }}</div>
					<p class="text-[11px] text-muted-foreground mt-1">{{ kpi.rationale }}</p>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';
import type { CampaignAnalysis, CampaignActivity } from '~~/types/marketing';

const props = defineProps<{
	campaign: CampaignAnalysis;
}>();

defineEmits<{
	create: [activity: CampaignActivity];
}>();

const expandedWeeks = ref<Set<number>>(new Set([1]));

function toggleWeek(week: number) {
	if (expandedWeeks.value.has(week)) {
		expandedWeeks.value.delete(week);
	} else {
		expandedWeeks.value.add(week);
	}
}

function getChannelIcon(channel: string): string {
	const icons: Record<string, string> = {
		social: 'lucide:share-2',
		email: 'lucide:mail',
		content: 'lucide:file-text',
		outreach: 'lucide:phone',
	};
	return icons[channel] || 'lucide:activity';
}

function getChannelBg(channel: string): string {
	const bgs: Record<string, string> = {
		social: 'bg-purple-100 dark:bg-purple-900/30',
		email: 'bg-blue-100 dark:bg-blue-900/30',
		content: 'bg-amber-100 dark:bg-amber-900/30',
		outreach: 'bg-green-100 dark:bg-green-900/30',
	};
	return bgs[channel] || 'bg-muted';
}

function getChannelColor(channel: string): string {
	const colors: Record<string, string> = {
		social: 'text-purple-600 dark:text-purple-400',
		email: 'text-blue-600 dark:text-blue-400',
		content: 'text-amber-600 dark:text-amber-400',
		outreach: 'text-green-600 dark:text-green-400',
	};
	return colors[channel] || 'text-muted-foreground';
}

function getPlatformIcon(platform: string): string {
	const icons: Record<string, string> = {
		linkedin: 'lucide:linkedin',
		facebook: 'lucide:facebook',
		instagram: 'lucide:instagram',
		threads: 'lucide:at-sign',
	};
	return icons[platform] || 'lucide:globe';
}
</script>
