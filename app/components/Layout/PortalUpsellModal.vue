<script setup lang="ts">
import { Building2, Sparkles, ArrowRight, PlayCircle } from 'lucide-vue-next';

const props = defineProps<{
	modelValue: boolean;
	hostOrgName?: string | null;
}>();

const emit = defineEmits<{
	(e: 'update:modelValue', value: boolean): void;
}>();

const isOpen = computed({
	get: () => props.modelValue,
	set: (val) => emit('update:modelValue', val),
});

function goToSignup() {
	isOpen.value = false;
	navigateTo('/organization/new');
}

function goToDemo() {
	isOpen.value = false;
	navigateTo('/try-demo');
}
</script>

<template>
	<UModal v-model="isOpen" :ui="{ width: 'max-w-md' }">
		<div class="p-6">
			<div class="flex items-center gap-3 mb-5">
				<div class="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center">
					<Sparkles class="size-5 text-[var(--cyan)]" />
				</div>
				<div>
					<h2 class="text-lg font-semibold text-gray-900">Run your business on Earnest</h2>
					<p class="text-sm text-gray-500">A workspace built for studios, agencies, and operators.</p>
				</div>
			</div>

			<div class="rounded-xl border border-gray-200 bg-gray-50/50 p-4 mb-5">
				<div class="flex items-center gap-2 mb-2">
					<Building2 class="size-4 text-gray-400" />
					<span class="text-xs uppercase tracking-wider text-gray-500 font-medium">
						{{ hostOrgName || 'This team' }} is using Earnest
					</span>
				</div>
				<p class="text-sm text-gray-700 leading-relaxed">
					You can be like {{ hostOrgName || 'them' }} — sign up for your own Earnest
					workspace and run your business with the same tools: projects, tickets,
					invoices, contracts, marketing, and more.
				</p>
			</div>

			<button
				class="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--cyan)] hover:bg-[var(--cyan)]/90 transition-colors group"
				@click="goToSignup"
			>
				<span class="text-sm font-medium text-white">Start your Earnest workspace</span>
				<ArrowRight class="size-4 text-white group-hover:translate-x-0.5 transition-transform" />
			</button>

			<button
				class="w-full mt-2 flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 hover:border-[var(--cyan)] hover:bg-cyan-50/30 transition-colors group"
				@click="goToDemo"
			>
				<div class="flex items-center gap-2">
					<PlayCircle class="size-4 text-gray-400 group-hover:text-[var(--cyan)] transition-colors" />
					<div class="text-left">
						<div class="text-sm font-medium text-gray-700">Try a live demo first</div>
						<div class="text-[11px] text-gray-400">Solo or agency workspace, pre-loaded with sample data</div>
					</div>
				</div>
				<ArrowRight class="size-4 text-gray-400 shrink-0 group-hover:text-[var(--cyan)] group-hover:translate-x-0.5 transition-all" />
			</button>

			<button
				class="w-full mt-2 p-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
				@click="isOpen = false"
			>
				Maybe later
			</button>
		</div>
	</UModal>
</template>
