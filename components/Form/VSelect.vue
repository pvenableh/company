<template>
	<div class="relative w-full input-container">
		<VLabel v-if="label && topLabel" :label="label" />

		<VField
			:id="name"
			as="select"
			:value="modelValue"
			:name="name"
			:label="label"
			:rules="rules"
			class="block py-2.5 px-0 w-full text-sm text-gray-900 bg-transparent border-0 border-b-2 border-gray-300 appearance-none dark:text-white dark:border-gray-600 dark:focus:border-purple-500 focus:outline-none focus:ring-0 focus:border-purple-600 peer uppercase tracking-wide select"
			@input="$emit('update:modelValue', $event.target.value)"
		>
			<option val="">
				Select
				<span v-if="placeholder">{{ placeholder }}</span>
				<span v-else>{{ label }}</span>
			</option>
			<option v-for="(option, index) in options" :key="index" :value="option" class="uppercase px-0">
				{{ formatOptionLabel(option) }}
			</option>
		</VField>
		<label
			v-if="label && !topLabel"
			:label="label"
			:for="name"
			class="uppercase tracking-wider absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-6 scale-75 top-3 origin-[0] peer-focus:left-0 peer-focus:text-purple-600 peer-focus:dark:text-purple-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6"
		>
			{{ label }}
		</label>
		<transition name="page">
			<VErrorMessage :name="name" as="div" class="error" />
		</transition>
	</div>
</template>
<script setup>
defineEmits(['update:modelValue']);

const props = defineProps({
	modelValue: {
		type: [String, Number],
		default: '',
	},
	type: {
		type: String,
		default: 'text',
	},
	rules: {
		type: String,
		default: null,
	},
	options: {
		type: Array,
		default: null,
	},
	name: {
		type: String,
		default: null,
	},
	label: {
		type: String,
		default: null,
	},
	placeholder: {
		type: String,
		default: null,
	},
	objectValues: {
		type: Boolean,
		default: false,
	},
	topLabel: {
		type: Boolean,
		default: false,
	},
});

function formatOptionLabel(option) {
	if (props.objectValues) {
		return option.name + ' $' + option.price;
	} else {
		return option;
	}
}
</script>
<style>
.input-container {
	.select {
		option {
			@apply uppercase px-0;
		}
	}
	.error {
		font-size: 8px;
		line-height: 10px;

		right: 0px;
		bottom: -12px;
		color: var(--purple);
		@apply absolute uppercase tracking-wide font-bold;
	}
}
</style>
