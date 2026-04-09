<template>
	<button
		:type="type"
		class="relative overflow-hidden p-px"
		:class="[
			'btn',
			{
				'btn-default': variant === 'default',
				'btn-primary': variant === 'primary',
				'btn-outline': variant === 'outline',
				'btn-danger': variant === 'danger',
			},
		]"
	>
		<div v-if="glow" class="glow inset-0 w-[60px] h-[60px] absolute rotate-45"></div>
		<div class="foreground">
			<slot />
		</div>
	</button>
</template>

<script setup>
const props = defineProps({
	type: {
		type: String,
		default: 'button',
	},
	variant: {
		type: String,
		default: 'default',
	},
	glow: {
		type: Boolean,
		default: true,
	},
});
</script>

<style>
@reference "~/assets/css/tailwind.css";
.glow {
	animation: move 4s ease-in infinite;
	offset-path: rect(0% auto 100% auto);
	background: radial-gradient(#00ffed, var(--cyan), transparent);
}

@keyframes move {
	0% {
		offset-distance: 0%;
		transform: scale(1);
	}
	50% {
		transform: scale(1.1);
	}

	100% {
		offset-distance: 100%;
		transform: scale(1);
	}
}

.btn {
	@apply inline-flex border-transparent items-center justify-center tracking-wider font-sans uppercase shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:hover:scale-95 transition ease-in-out duration-150 rounded relative;
	.foreground {
		@apply block z-10 relative px-6 py-2 rounded w-full h-full;
	}
}

.btn-default {
	@apply text-white bg-gray-500;
	.foreground {
		@apply bg-gray-500;
	}
}

.btn-primary {
}

.btn-outline {
	@apply text-gray-900 bg-gray-50;
	.foreground {
		@apply bg-gray-50;
	}
}

.btn-danger {
}
</style>
