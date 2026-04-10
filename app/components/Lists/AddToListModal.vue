<template>
	<UModal :model-value="true" @update:model-value="$emit('close')">
		<UCard>
			<template #header>
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-semibold">Add to Mailing List</h3>
					<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="$emit('close')" />
				</div>
			</template>

			<div class="space-y-3">
				<p class="text-sm text-muted-foreground">
					Select a list to add {{ contactName }} to:
				</p>

				<div class="space-y-2 max-h-64 overflow-y-auto">
					<label
						v-for="list in lists"
						:key="list.id"
						class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
						:class="selectedListId === list.id ? 'border-primary bg-primary/5' : ''"
					>
						<input
							type="radio"
							:value="list.id"
							v-model="selectedListId"
							class="accent-primary"
						/>
						<div>
							<p class="text-sm font-medium">{{ list.name }}</p>
							<p class="text-xs text-muted-foreground">
								{{ list.subscriber_count || 0 }} subscribers
							</p>
						</div>
					</label>
				</div>
			</div>

			<template #footer>
				<div class="flex justify-end gap-2">
					<UButton variant="soft" color="gray" @click="$emit('close')">Cancel</UButton>
					<UButton color="primary" :disabled="!selectedListId || adding" :loading="adding" @click="handleAdd">
						Add to List
					</UButton>
				</div>
			</template>
		</UCard>
	</UModal>
</template>

<script setup lang="ts">
import type { MailingList } from '~~/shared/email/contacts';

const props = defineProps<{
	contactId: number;
	contactName: string;
	lists: MailingList[];
}>();

const emit = defineEmits<{
	close: [];
	added: [listId: number];
}>();

const selectedListId = ref<number | null>(null);
const adding = ref(false);

const { addToList } = useContacts();

async function handleAdd() {
	if (!selectedListId.value) return;
	adding.value = true;
	try {
		await addToList(props.contactId, selectedListId.value);
		emit('added', selectedListId.value);
		emit('close');
	} finally {
		adding.value = false;
	}
}
</script>
