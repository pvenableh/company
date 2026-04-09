<script setup lang="ts">
const props = defineProps<{
	modelValue: string;
	label: string;
	field: 'brand_direction' | 'goals' | 'target_audience' | 'location';
	placeholder?: string;
	rows?: number;
	entityType: 'organization' | 'client';
	entityId: string;
	organizationId: string;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: string];
}>();

const { isGenerating, generate, getOptionsForField, clear } = useBrandSuggestions();

const showOptions = ref(false);
const options = ref<string[]>([]);

const handleGenerate = async () => {
	const result = await generate({
		entityType: props.entityType,
		entityId: props.entityId,
		organizationId: props.organizationId,
		field: props.field,
		currentValue: props.modelValue || undefined,
	});

	if (result && result.length > 0) {
		options.value = getOptionsForField(props.field);
		showOptions.value = true;
	}
};

const selectOption = (option: string) => {
	emit('update:modelValue', option);
	showOptions.value = false;
};

const dismissOptions = () => {
	showOptions.value = false;
	clear();
};
</script>

<template>
	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<label class="block text-sm font-medium">{{ label }}</label>
			<button
				v-if="entityId"
				type="button"
				class="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
				:disabled="isGenerating"
				@click="handleGenerate"
			>
				<UIcon
					:name="isGenerating ? 'i-heroicons-arrow-path' : 'i-heroicons-sparkles'"
					:class="isGenerating ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'"
				/>
				{{ isGenerating ? 'Generating...' : 'AI Suggest' }}
			</button>
		</div>

		<textarea
			:value="modelValue"
			@input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
			:rows="rows || 3"
			class="w-full rounded-md border bg-background px-3 py-2 text-sm"
			:placeholder="placeholder"
		/>

		<!-- AI Options Picker -->
		<div v-if="showOptions && options.length > 0" class="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-xs font-medium text-primary flex items-center gap-1">
					<UIcon name="i-heroicons-sparkles" class="w-3 h-3" />
					AI Suggestions
				</span>
				<button type="button" class="text-xs text-muted-foreground hover:text-foreground" @click="dismissOptions">
					Dismiss
				</button>
			</div>
			<div class="space-y-1.5">
				<button
					v-for="(option, i) in options"
					:key="i"
					type="button"
					class="w-full text-left p-2.5 rounded-md border border-transparent bg-background hover:border-primary/30 hover:bg-primary/5 transition-all text-sm leading-relaxed"
					@click="selectOption(option)"
				>
					{{ option }}
				</button>
			</div>
		</div>
	</div>
</template>
