<template>
	<div class="segmented-control">
		<UFormGroup :label="label + ':'">
			<!-- Interactive Segmented Control -->
			<div class="relative">
				<!-- Steps Bar -->
				<div class="segmented-track relative flex items-center rounded overflow-hidden h-5">
					<!-- Full-width gradient background -->
					<div
						class="absolute inset-0 w-full h-full"
						:class="progressBarClass"
						:style="{
							background: customGradient || undefined,
						}"
					></div>

					<!-- Mask layer that reveals the gradient -->
					<div
						ref="maskLayer"
						class="absolute inset-0 bg-gray-200 dark:bg-gray-700 h-full transition-all duration-300 origin-right"
						:style="{
							width: `${100 - progressWidth}%`,
							right: 0,
							left: 'auto',
						}"
					></div>

					<!-- Steps -->
					<div class="segmented-steps relative flex w-full h-full z-10">
						<div
							v-for="(option, index) in options"
							:key="option.value"
							class="segmented-step flex-1 h-full flex items-center justify-center cursor-pointer relative uppercase !text-[9px]"
							:class="{
								'text-white font-medium': currentIndex >= index,
								'text-gray-600': currentIndex < index,
								[activeStepClass]: currentIndex >= index,
								[inactiveStepClass]: currentIndex < index,
							}"
							@click="updateValue(option.value)"
						>
							<span v-if="option.icon" class="mr-1">{{ option.icon }}</span>
							{{ option.label }}
						</div>
					</div>
				</div>
			</div>
		</UFormGroup>
	</div>
</template>

<script setup>
import { gsap } from 'gsap';
import { ref, computed } from 'vue';

const props = defineProps({
	modelValue: {
		type: [String, Number],
		required: true,
	},
	options: {
		type: Array,
		required: true,
		// Each option should have at least { value, label }
		// Options can also include { icon, color }
	},
	label: {
		type: String,
		default: '',
	},
	// Allow custom styling through classes
	progressBarClass: {
		type: String,
		default: '',
	},
	activeStepClass: {
		type: String,
		default: '',
	},
	inactiveStepClass: {
		type: String,
		default: '',
	},
	// Predefined color schemes
	colorScheme: {
		type: String,
		default: '', // 'priority', 'status', or custom
	},
	// Custom gradient for the progress bar
	customGradient: {
		type: String,
		default: '',
	},
	// Animation duration in seconds
	animationDuration: {
		type: Number,
		default: 0.4,
	},
});

const emit = defineEmits(['update:modelValue']);

// Get current index
const currentIndex = computed(() => {
	return props.options.findIndex((option) => option.value === props.modelValue);
});

// Calculate progress width based on current step
const progressWidth = computed(() => {
	if (currentIndex.value === -1) return 0;
	return ((currentIndex.value + 1) / props.options.length) * 100;
});

// Handle elements
const maskLayer = ref(null);

// Update value when clicked on step
const updateValue = (newValue) => {
	if (props.modelValue !== newValue) {
		// Find the new index
		const newIndex = props.options.findIndex((option) => option.value === newValue);

		// Animate the mask layer to reveal the gradient
		if (maskLayer.value) {
			const newMaskWidth = 100 - ((newIndex + 1) / props.options.length) * 100;

			gsap.to(maskLayer.value, {
				width: `${newMaskWidth}%`,
				duration: props.animationDuration,
				ease: 'power2.inOut',
				onComplete: () => {
					// Update the model after animation completes
					emit('update:modelValue', newValue);
				},
			});
		} else {
			// Fallback if ref is not available
			emit('update:modelValue', newValue);
		}
	}
};
</script>

<style scoped>
.segmented-track {
	background-color: rgba(229, 231, 235, 0.5);
	box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);
	overflow: hidden;
}

.segmented-step {
	position: relative;
	transition: color 0.3s ease;
	z-index: 10; /* Ensure text is above the mask and gradient */
}

.segmented-step::after {
	content: '';
	position: absolute;
	right: 0;
	top: 25%;
	height: 50%;
	width: 1px;
	background-color: rgba(209, 213, 219, 0.5);
	z-index: 10;
}

.segmented-step:last-child::after {
	display: none;
}

.segmented-step:hover {
	background-color: rgba(0, 0, 0, 0.05);
}
</style>
