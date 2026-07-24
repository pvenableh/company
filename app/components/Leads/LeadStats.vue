<template>
	<div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
		<div class="ios-card p-4">
			<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider">Total Leads</p>
			<p class="text-2xl font-bold text-foreground mt-1">{{ stats.total }}</p>
		</div>
		<div class="ios-card p-4">
			<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider">New This Week</p>
			<p class="text-2xl font-bold text-blue-500 mt-1">{{ stats.new_this_week }}</p>
		</div>
		<div class="ios-card p-4">
			<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider">Avg Score</p>
			<p class="text-2xl font-bold text-foreground mt-1">{{ stats.avg_score }}</p>
		</div>
		<div class="ios-card p-4">
			<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider">Pipeline Value</p>
			<p class="text-2xl font-bold text-success mt-1">${{ stats.pipeline_value.toLocaleString() }}</p>
		</div>
		<div class="ios-card p-4">
			<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider">Won</p>
			<p class="text-2xl font-bold text-success mt-1">{{ stats.by_stage?.won || 0 }}</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { LeadStats } from '~~/shared/leads';

defineProps<{ stats: LeadStats }>();
</script>
