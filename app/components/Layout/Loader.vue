<template>
	<div class="relative flex items-center justify-center loader">
		<div class="lds-ripple">
			<div></div>
			<div></div>
		</div>
		<h3 v-if="text" class="text-center w-64 uppercase text-[10px] tracking-wide leading-3 pulse-text">
			{{ text }}
		</h3>
	</div>
</template>

<script setup>
const props = defineProps({
	text: String,
	default: null,
});
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";
.lds-ripple,
.lds-ripple div {
	box-sizing: border-box;
}
.lds-ripple {
	display: inline-block;
	position: relative;
	width: 80px;
	height: 80px;
}
.lds-ripple div {
	position: absolute;
	border: 4px solid var(--cyan);
	opacity: 1;
	border-radius: 50%;
	animation: lds-ripple 1s cubic-bezier(0, 0.2, 0.8, 1) infinite;
}
.lds-ripple div:nth-child(2) {
	animation-delay: -0.5s;
}
@keyframes lds-ripple {
	0% {
		top: 36px;
		left: 36px;
		width: 8px;
		height: 8px;
		opacity: 0;
	}
	4.9% {
		top: 36px;
		left: 36px;
		width: 8px;
		height: 8px;
		opacity: 0;
	}
	5% {
		top: 36px;
		left: 36px;
		width: 8px;
		height: 8px;
		opacity: 1;
	}
	100% {
		top: 0;
		left: 0;
		width: 80px;
		height: 80px;
		opacity: 0;
	}
}
.pulse-text {
	animation: pulse 2s infinite ease-in-out;
	@apply absolute mt-28;
}

@keyframes pulse {
	0% {
		opacity: 1;
		transform: scale(1);
		color: var(--cyan);
	}
	50% {
		opacity: 0.7;
		transform: scale(1.05);
		color: #666;
	}
	100% {
		opacity: 1;
		transform: scale(1);
		color: var(--cyan);
	}
}
</style>
