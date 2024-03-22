<script setup>
const props = defineProps({
	item: {
		type: String,
		default: '',
	},
	collection: {
		type: String,
		default: '',
	},
	parent: {
		type: String,
		default: '',
	},
});

const { user } = useDirectusAuth();
const comment = ref(null);
const max = ref(255);

const junctionTable = props.collection + '_comments';

const junctionId = props.collection + '_id';

async function postComment() {
	if (!comment.value) {
		return;
	} else {
		const result = await useDirectus(
			createItem('comments', {
				comment: comment.value,
				user: user.value.id,
				item: props.item,
				collection: props.collection,
			}),
		);

		connectComment(result.id);

		comment.value = null;
	}
}

async function connectComment(commentId) {
	if (commentId) {
		const result = await useDirectus(
			createItem(junctionTable, {
				[junctionId]: props.item,
				comments_id: commentId,
			}),
		);
		updateParent();
	}
}

async function updateParent() {
	const result = await useDirectus(updateItem('tasks', props.item, { updated_on: new Date() }));
}
</script>
<template>
	<div class="relative w-full flex items-center justify-center flex-row">
		<Avatar size="xs" />
		<div class="flex-grow relative">
			<input
				v-model="comment"
				type="text"
				:maxlength="max"
				class="w-full h-8 comment-input"
				placeholder="Write a comment..."
				@keyup.enter="postComment"
			/>
			<a
				href="#"
				class="absolute right-0 font-bold py-2 px-2 uppercase blue cursor-pointer post-btn"
				@click.prevent="postComment"
			>
				Post
			</a>
		</div>
	</div>
</template>
<style>
.comment-input {
	border-radius: 18px;
	background: rgb(245, 245, 245);
	font-size: 14px;
	@apply px-4 border-none shadow-inner dark:bg-black dark:text-white;
	padding-right: 40px;
}
.post-btn {
	line-height: 18px;
	font-size: 15px;
	color: var(--cyan);
	top: calc(50% - 17px);
}
</style>
