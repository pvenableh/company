<template>
	<div class="relative z-0 floating-input">
		<input
			type="text"
			id="default_standard"
			class="block py-2.5 px-0 w-full text-sm text-gray-900 bg-transparent border-0 border-b-2 border-gray-300 appearance-none dark:text-white dark:border-gray-600 dark:focus:border-blue-500 focus:outline-none focus:ring-0 focus:border-blue-600 peer"
			:name="name"
			:id="name"
			:type="type"
			:rules="rules"
			placeholder=" "
			:value="modelValue"
			@input="$emit('update:modelValue', $event.target.value)"
		/>
		<label
			v-if="label"
			:label="label"
			:for="name"
			class="uppercase tracking-wider absolute text-sm text-gray-500 dark:text-gray-400 duration-300 transform -translate-y-6 scale-75 top-3 origin-[0] peer-focus:left-0 peer-focus:text-blue-600 peer-focus:dark:text-blue-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6"
		>
			{{ label }}
		</label>
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
});
</script>
<style>
.floating-input {
	label {
		z-index: -10;
	}
}
</style>
