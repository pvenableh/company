<template>
	<UModal v-model="isOpen" class="sm:max-w-lg">
		<template #header>
			<div class="w-full space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-bold uppercase tracking-wide">{{ title }}</h3>
					<Button variant="ghost" size="icon-sm" @click="isOpen = false">
						<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
					</Button>
				</div>
				<FormStatusTimeline
					v-if="isEditing && statuses.length"
					:currentStatus="currentStatus"
					:statuses="statuses"
					:collection="collection"
					:itemId="itemId"
					@status-change="$emit('status-change', $event)"
				/>
			</div>
		</template>

		<form @submit.prevent="$emit('submit')" class="space-y-4 p-4 max-h-[70vh] overflow-y-auto">
			<slot />
		</form>

		<template #footer>
			<div class="flex items-center justify-between w-full">
				<div class="flex items-center gap-1">
					<UTooltip v-if="isEditing && canDelete" text="Delete">
						<Button
							variant="ghost"
							size="icon-sm"
							class="text-destructive hover:text-destructive hover:bg-destructive/10"
							:disabled="saving"
							@click="$emit('delete')"
						>
							<Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
						</Button>
					</UTooltip>
					<Button size="sm" :disabled="saving || submitDisabled" @click="$emit('submit')">
						<Icon v-if="saving" name="lucide:loader-2" class="h-3.5 w-3.5 mr-1 animate-spin" />
						<Icon v-else name="lucide:save" class="h-3.5 w-3.5 mr-1" />
						{{ submitLabel || (isEditing ? 'Save' : 'Create') }}
					</Button>
				</div>
				<NuxtLink
					v-if="isEditing && detailRoute"
					:to="detailRoute"
					class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
				>
					Full Details
					<Icon name="lucide:chevron-right" class="w-3 h-3" />
				</NuxtLink>
			</div>
		</template>
	</UModal>
</template>

<script setup>
import { Button } from '~/components/ui/button';

defineProps({
	title: { type: String, required: true },
	isEditing: { type: Boolean, default: false },
	saving: { type: Boolean, default: false },
	submitDisabled: { type: Boolean, default: false },
	canDelete: { type: Boolean, default: true },
	submitLabel: { type: String, default: null },
	statuses: { type: Array, default: () => [] },
	currentStatus: { type: String, default: '' },
	collection: { type: String, default: '' },
	itemId: { type: [String, Number], default: null },
	detailRoute: { type: [String, Object], default: null },
});

defineEmits(['submit', 'delete', 'status-change']);

const isOpen = defineModel({ default: false });
</script>
