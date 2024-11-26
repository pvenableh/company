<template>
	<div :class="props.class">
		<UPopover :open="isOpen" @close="isOpen = false">
			<!-- Main Share Button -->
			<UButton
				:icon="props.icon || 'i-heroicons-share'"
				:color="props.color || 'gray'"
				:variant="props.variant || 'ghost'"
				:size="props.size || 'sm'"
				class="w-8 h-8"
				@click="handleShareClick"
			/>

			<!-- Share Options Popover -->
			<template #panel>
				<div class="flex flex-col p-2 gap-1 min-w-[200px]">
					<UButton
						v-for="option in shareOptions"
						:key="option.name"
						:icon="option.icon"
						variant="ghost"
						class="justify-start"
						@click="() => handleOptionClick(option)"
					>
						{{ option.name === 'Copy Link' && copied ? 'Copied!' : option.name }}
					</UButton>
				</div>
			</template>
		</UPopover>
	</div>
</template>

<script setup>
const props = defineProps({
	url: {
		type: String,
		default: () => (process.client ? window.location.href : ''),
	},
	title: {
		type: String,
		default: () => (process.client ? document.title : ''),
	},
	description: {
		type: String,
		default: '',
	},
	icon: {
		type: String,
		default: 'i-heroicons-share',
	},
	color: {
		type: String,
		default: 'gray',
	},
	variant: {
		type: String,
		default: 'ghost',
	},
	size: {
		type: String,
		default: 'sm',
	},
	class: {
		type: String,
		default: '',
	},
});

const emit = defineEmits(['share']);

const isOpen = ref(false);
const copied = ref(false);
const toast = useToast();

// Check if Web Share API is available
const canNativeShare = computed(() => {
	return process.client && navigator.share;
});

const shareOptions = computed(() => [
	{
		name: 'Copy Link',
		icon: 'i-heroicons-link',
		action: copyToClipboard,
	},
	{
		name: 'Email',
		icon: 'i-heroicons-envelope',
		action: shareViaEmail,
	},
	{
		name: 'Messages',
		icon: 'i-heroicons-chat-bubble-left-right',
		action: shareViaMessages,
	},
]);

// Share handlers
const handleShareClick = async () => {
	if (canNativeShare.value) {
		await handleNativeShare();
	} else {
		isOpen.value = true;
	}
};

const handleNativeShare = async () => {
	try {
		await navigator.share({
			title: props.title,
			text: props.description,
			url: props.url,
		});
		emit('share', 'native');
	} catch (err) {
		console.error('Error sharing:', err);
		// Fallback to showing popover if native share fails
		isOpen.value = true;
	}
};

const copyToClipboard = async () => {
	try {
		await navigator.clipboard.writeText(props.url);
		copied.value = true;
		emit('share', 'copy');

		toast.add({
			title: 'Success',
			description: 'Link copied to clipboard',
			color: 'green',
		});

		setTimeout(() => {
			copied.value = false;
		}, 2000);
	} catch (err) {
		console.error('Failed to copy:', err);
		toast.add({
			title: 'Error',
			description: 'Failed to copy link',
			color: 'red',
		});
	}
};

const shareViaEmail = () => {
	const mailtoUrl = `mailto:?subject=${encodeURIComponent(props.title)}&body=${encodeURIComponent(
		`${props.description}\n\n${props.url}`,
	)}`;
	window.open(mailtoUrl);
	emit('share', 'email');
};

const shareViaMessages = () => {
	const smsUrl = `sms:?body=${encodeURIComponent(`${props.title}\n${props.url}`)}`;
	window.open(smsUrl);
	emit('share', 'sms');
};

const handleOptionClick = (option) => {
	option.action();
	isOpen.value = false;
};
</script>
