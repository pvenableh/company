<template>
	<UModal v-model="open">
		<template #header>
			<div class="flex items-center gap-2">
				<Icon name="i-heroicons-flag" class="text-red-500" />
				<span class="font-semibold text-sm">Report Comment</span>
			</div>
		</template>

		<div class="p-4 space-y-4">
			<div>
				<label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
				<USelectMenu
					v-model="reason"
					:options="reasonOptions"
					value-attribute="value"
					option-attribute="label"
					placeholder="Select a reason"
				/>
			</div>

			<div>
				<label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
					Details <span class="text-gray-400">(optional)</span>
				</label>
				<UTextarea v-model="details" placeholder="Add more context..." :rows="3" />
			</div>
		</div>

		<template #footer>
			<div class="flex justify-end gap-2">
				<UButton variant="ghost" size="sm" @click="open = false">Cancel</UButton>
				<UButton color="red" size="sm" :disabled="!reason" :loading="loading" @click="handleSubmit">
					Report
				</UButton>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import type { CommentReportReason } from '~~/types/comments';

const props = defineProps<{
	commentId: number;
}>();

const emit = defineEmits<{
	reported: [];
}>();

const open = defineModel<boolean>({ default: false });
const reason = ref<CommentReportReason | ''>('');
const details = ref('');
const loading = ref(false);

const { reportComment } = useComments();

const reasonOptions = [
	{ value: 'spam', label: 'Spam' },
	{ value: 'inappropriate', label: 'Inappropriate content' },
	{ value: 'harassment', label: 'Harassment' },
	{ value: 'off_topic', label: 'Off topic' },
	{ value: 'other', label: 'Other' },
];

async function handleSubmit() {
	if (!reason.value) return;
	try {
		loading.value = true;
		await reportComment({
			comment: props.commentId,
			reason: reason.value as CommentReportReason,
			details: details.value || undefined,
		});
		open.value = false;
		reason.value = '';
		details.value = '';
		emit('reported');
	} catch (error) {
		console.error('Error reporting comment:', error);
	} finally {
		loading.value = false;
	}
}
</script>
