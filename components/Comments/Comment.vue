<script setup>
const { user } = useDirectusAuth();

const props = defineProps({
	comment: {
		type: Object,
		default: null,
	},
	collection: {
		type: String,
		default: '',
	},
});

const avatar = computed(() => {
	if (props.comment.comments_id.user.avatar) {
		return 'https://admin.1033lenox.com/assets/' + props.comment.comments_id.user.avatar + '?key=medium';
	} else {
		return (
			'https://ui-avatars.com/api/?name=' +
			props.comment.comments_id.user.first_name +
			' ' +
			props.comment.comments_id.user.last_name +
			'&background=eeeeee&color=00bfff'
		);
	}
});
</script>
<template>
	<div class="w-full relative flex items-start justify-start flex-row pb-3 comment">
		<UAvatar
			class="comment__user-avatar"
			size="xs"
			:src="avatar"
			:alt="comment.comments_id.user.first_name + ' ' + comment.comments_id.user.last_name"
		/>
		<div class="comment__comment">
			<div class="flex flex-row comment__comment-name">
				<h5 v-if="user">
					<span v-if="user.id === comment.comments_id.user.id">You</span>
					<span v-else>{{ comment.comments_id.user.first_name }} {{ comment.comments_id.user.last_name }}</span>
				</h5>
				<h5 v-else>{{ comment.comments_id.user.first_name }} {{ comment.comments_id.user.last_name }}</h5>
			</div>
			<div class="comment__comment-text" v-html="comment.comments_id.comment"></div>
		</div>
		<h5 class="absolute left-[40px] -bottom-[0px] uppercase font-condensed-bold text-left z-0 pl-1 comment__time">
			{{ getRelativeTime(comment.comments_id.date_created) }}
		</h5>
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
