<!-- CommentItem.vue -->
<script setup>
import { ref } from 'vue';
import { useMentionPlugin } from './composables/useMentionPlugin';

const props = defineProps({
	comment: {
		type: Object,
		required: true,
	},
	isEditing: {
		type: Boolean,
		default: false,
	},
	currentUser: {
		type: Object,
		required: true,
	},
});

const emit = defineEmits(['edit', 'cancel-edit', 'update', 'delete']);

const editedContent = ref('');
const { editor } = useMentionPlugin(editedContent);

const avatar = computed(() => {
	if (props.comment.comments_id.user.avatar) {
		return `${useRuntimeConfig().public.apiBase}/assets/${props.comment.comments_id.user.avatar}?key=medium`;
	}
	return `https://ui-avatars.com/api/?name=${props.comment.comments_id.user.first_name}+${props.comment.comments_id.user.last_name}`;
});

const isOwner = computed(() => {
	return props.currentUser?.id === props.comment.comments_id.user.id;
});

const handleUpdate = () => {
	emit('update', props.comment.comments_id.id, editedContent.value);
};
</script>

<template>
	<div class="comment-item flex gap-3 p-4 bg-gray-50 rounded-lg">
		<UAvatar :src="avatar" :alt="comment.comments_id.user.first_name" size="sm" />

		<div class="flex-grow">
			<div class="flex justify-between items-start">
				<div>
					<span class="font-medium">
						{{ comment.comments_id.user.first_name }} {{ comment.comments_id.user.last_name }}
					</span>
					<span class="text-sm text-gray-500 ml-2">
						{{ useTimeAgo(comment.comments_id.date_created) }}
					</span>
				</div>

				<div v-if="isOwner" class="flex gap-2">
					<UButton
						v-if="!isEditing"
						icon="i-heroicons-pencil"
						color="gray"
						variant="ghost"
						size="xs"
						@click="$emit('edit', comment.comments_id.id)"
					/>
					<UButton
						v-if="!isEditing"
						icon="i-heroicons-trash"
						color="red"
						variant="ghost"
						size="xs"
						@click="$emit('delete', comment.id)"
					/>
				</div>
			</div>

			<div v-if="!isEditing" class="comment-content mt-1 text-gray-700" v-html="comment.comments_id.comment" />

			<div v-else class="mt-2">
				<editor-content :editor="editor" />
				<div class="flex gap-2 mt-2">
					<UButton size="sm" color="primary" @click="handleUpdate">Save</UButton>
					<UButton size="sm" color="gray" variant="soft" @click="$emit('cancel-edit')">Cancel</UButton>
				</div>
			</div>
		</div>
	</div>
</template>
<style>
.comment {
	&__user-avatar {
		@apply mr-2;
	}

	&__comment {
		border-radius: 18px;
		background: #f5f5f5;
		font-size: 14px;
		word-break: break-word;
		word-wrap: break-word;
		@apply py-2 px-3 shadow-inner dark:bg-black dark:text-white;

		&-name {
			font-size: 10px;
			line-height: 10px;
			@apply font-bold;
		}
	}

	&__time {
		font-size: 7px;
		@apply font-bold;
	}
}
</style>
