<!-- eslint-disable no-console -->
<script setup>
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';

const { createItem, deleteItem } = useDirectusItems();
const { params } = useRoute();
const { user } = useDirectusAuth();

console.log(user.value);

definePageMeta({
	middleware: ['auth'],
});

const { data } = useRealtimeSubscription(
	'messages', // Collection name
	[
		'id,status,text,date_created,user_created.id,user_created.first_name,user_created.last_name,user_created.avatar,channel.id,channel.name',
	], // Fields
	{
		channel: { name: { _eq: params.channel } },
		status: {
			_eq: 'published',
		},
	}, // Filter
	['-date_created'], // Sort
);

const messages = ref(data.value);

const newMessage = ref('');

const sendMessage = async (channel) => {
	console.log(newMessage.value);
	console.log(channel);

	await createItem('messages', {
		text: newMessage.value,
		channel: channel,
		status: 'published',
		user_created: user.value.id,
	});

	newMessage.value = '';
};

const deleteMessage = async (id) => {
	await deleteItem('messages', id);
};
</script>
<template>
	<div class="md:px-6 mx-auto flex items-start justify-center flex-col relative px-4 pt-20">
		<h1>{{ params.channel }}</h1>
		<h3>{{ user.first_name }}</h3>

		<div
			v-for="message in messages"
			:key="message.id"
			class="flex flex-row w-full border rounded-sm p-3 mb-3 relative channel-message"
		>
			<UIcon
				v-if="message.user_created.id === user.id"
				name="i-heroicons-trash-20-solid"
				@click="deleteMessage(message.id)"
				class="cursor-pointer absolute right-[10px]"
			/>
			<Avatar
				v-if="message.user_created.avatar"
				:avatar="message.user_created.avatar"
				:text="message.user_created.first_name + ' ' + message.user_created.last_name"
			/>
			<Avatar v-else :text="message.user_created.first_name + ' ' + message.user_created.last_name" />
			<div v-if="message.user_created" class="ml-3">
				<h3 class="bold uppercase text-[10px]">
					{{ message.user_created.first_name }} {{ message.user_created.last_name }}
					<span class="text-[8px]">{{ getRelativeTime(message.date_created) }}</span>
				</h3>
				<div v-html="message.text"></div>
			</div>
		</div>
		<div>
			<ChannelsCreateMessage v-model="newMessage" class="w-full" />
			<UButton @click="sendMessage(data[0].channel.id)">Send</UButton>
		</div>
	</div>
</template>
<style>
.channel-message {
	font-size: 13px;
	ul {
		list-style-type: disc;
		li {
			@apply ml-4;
		}
	}
	.mention {
		background: #dfdfdf;
		@apply rounded px-2 py-1;
	}
}
</style>
