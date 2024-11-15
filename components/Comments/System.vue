<script setup>
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';
const { createItem, deleteItems } = useDirectusItems();

const props = defineProps({
	itemId: {
		type: [String, Number],
		required: true,
	},
	collection: {
		type: String,
		required: true,
	},
});

const { user } = useDirectusAuth();
const newComment = ref('');
const showComments = ref(false);
const isLoading = ref(false);

const junctionTable = `${props.collection}_comments`;
const collectionIdField = `${props.collection}_id`;

// Define filter explicitly without status
const filter = {
	[collectionIdField]: {
		_eq: props.itemId,
	},
};

const { data: comments } = useRealtimeSubscription(
	junctionTable,
	[
		'id',
		'comments_id.id',
		'comments_id.comment',
		'comments_id.date_created',
		'comments_id.user.id',
		'comments_id.user.first_name',
		'comments_id.user.last_name',
		'comments_id.user.avatar',
		'comments_id.reactions.id',
		'comments_id.reactions.users_id.id',
	],
	filter,
	'-comments_id.date_created',
);

const commentsCount = computed(() => comments.value?.length || 0);

async function postComment() {
	if (!newComment.value.trim()) return;
	isLoading.value = true;

	try {
		const comment = await createItem('comments', {
			comment: newComment.value,
			user: user.value.id,
		});

		await createItem(junctionTable, {
			[collectionIdField]: props.itemId,
			comments_id: comment.id,
		});

		newComment.value = '';
	} catch (error) {
		console.error('Error posting comment:', error);
	} finally {
		isLoading.value = false;
	}
}
</script>

<template>
	<div class="comments-system">
		<div class="flex items-center gap-2 text-sm">
			<UButton
				variant="ghost"
				:icon="showComments ? 'i-heroicons-chat-bubble-left-right' : 'i-heroicons-chat-bubble-left'"
				@click="showComments = !showComments"
			>
				{{ commentsCount }} {{ commentsCount === 1 ? 'Comment' : 'Comments' }}
			</UButton>
		</div>

		<Transition
			enter-active-class="transition duration-200 ease-out"
			enter-from-class="transform scale-95 opacity-0"
			enter-to-class="transform scale-100 opacity-100"
			leave-active-class="transition duration-200 ease-in"
			leave-from-class="transform scale-100 opacity-100"
			leave-to-class="transform scale-95 opacity-0"
		>
			<div v-if="showComments" class="mt-4 space-y-4">
				<div v-if="user" class="flex gap-2">
					<UTextarea
						v-model="newComment"
						placeholder="Write a comment..."
						:rows="1"
						class="flex-grow"
						@keydown.enter.exact.prevent="postComment"
					/>
					<UButton color="primary" @click="postComment">Post</UButton>
				</div>

				<TransitionGroup name="comments" tag="div" class="space-y-4">
					<div v-for="comment in comments" :key="comment.id" class="flex gap-3">
						<UAvatar
							:src="
								comment.comments_id.user?.avatar
									? `${useRuntimeConfig().public.directusUrl}/assets/${comment.comments_id.user.avatar}`
									: null
							"
							:alt="comment.comments_id.user?.first_name"
							size="sm"
						/>

						<div class="flex-grow">
							<div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
								<div class="flex items-center gap-2 mb-1">
									<span class="font-medium text-sm">
										{{ comment.comments_id.user?.first_name }} {{ comment.comments_id.user?.last_name }}
									</span>
									<span class="text-xs text-gray-500">
										{{ new Date(comment.comments_id.date_created).toLocaleString() }}
									</span>
								</div>
								<p class="text-sm">{{ comment.comments_id.comment }}</p>
							</div>

							<ReactionsBar :item-id="String(comment.comments_id.id)" collection="comments" class="mt-1" />
						</div>
					</div>
				</TransitionGroup>

				<div v-if="isLoading" class="py-4 text-center">
					<UIcon name="i-heroicons-arrow-path" class="animate-spin" />
				</div>
			</div>
		</Transition>
	</div>
</template>

<style>
.comments-enter-active,
.comments-leave-active {
	transition: all 0.3s ease;
}
.comments-enter-from,
.comments-leave-to {
	opacity: 0;
	transform: translateX(-20px);
}
</style>
