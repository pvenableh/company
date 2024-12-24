<script setup>
import { gsap } from 'gsap';

const props = defineProps({
	progressPercentage: {
		type: Number,
		required: true,
	},
});

const animatedProgress = ref(0); // Displayed animated value

const animateProgress = (newVal) => {
	gsap.to(animatedProgress, {
		duration: 0.3,
		value: newVal,
		ease: 'power2.out',
		snap: { value: 1 },
	});
};

watch(
	() => props.progressPercentage,
	(newVal) => {
		animateProgress(newVal);
	},
	{ immediate: true }, // Animate on initial render
);

const circleProgress = computed(() => {
	const radius = 50;
	const circumference = 2 * Math.PI * radius;
	const offset = ((100 - animatedProgress.value) / 100) * circumference;
	return { radius, circumference, offset };
});
</script>
<template>
	<div class="relative flex justify-center items-center">
		<!-- Circular Chart -->
		<svg width="120" height="120" viewBox="0 0 120 120" class="transform -rotate-90" xmlns="http://www.w3.org/2000/svg">
			<defs>
				<linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
					<stop offset="0%" stop-color="var(--cyan)" />
					<stop offset="100%" stop-color="var(--green)" />
				</linearGradient>
			</defs>
			<!-- Background Circle -->
			<circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" stroke-width="10" />
			<!-- Progress Circle -->
			<circle
				cx="60"
				cy="60"
				r="50"
				fill="none"
				stroke="url(#progressGradient)"
				stroke-width="10"
				:stroke-dasharray="circleProgress.circumference"
				:stroke-dashoffset="circleProgress.offset"
				stroke-linecap="round"
				class="transition-[stroke-dashoffset] duration-700 ease-out"
			/>
		</svg>

		<!-- Progress Percentage -->
		<span class="absolute text-gray-800 font-bold text-[28px] leading-[30px]">{{ animatedProgress.toFixed(0) }}%</span>
	</div>
</template>
<style></style>
