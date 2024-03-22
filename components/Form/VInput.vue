<template>
	<div class="relative w-full input-container">
		<!-- <VLabel v-if="label" :label="label" /> -->
		<VField
			:name="name"
			:id="name"
			class="block py-2.5 px-0 w-full text-sm text-gray-900 dark:text-white bg-transparent border-0 border-b-2 border-gray-300 appearance-none  focus:outline-none focus:ring-0 focus:border-gray-900 peer"
			:readonly="disabled"
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
			class="uppercase tracking-wider absolute text-sm text-gray-500 dark:text-cyan duration-300 transform -translate-y-6 scale-75 top-3 origin-[0] peer-focus:left-0 peer-focus:text-gray-600  peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-6"
		>
			{{ label }}
		</label>
		<transition name="page">
			<VErrorMessage :name="name" as="div" class="error" />
		</transition>
		<!--
    <VField v-slot="{ field, meta, errors }">
      <input
        :name="name"
        :type="type"
        :rules="rules"
        :placeholder="placeholder"
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
         :validateOnChange="true"
      :validateOnModelUpdate="true"
      :validateOnInput="true"
      :validateOnBlur="true"
      :validateOnMount="true"
      />
      <VErrorMessage :name="name" class="uppercase" />
    </VField> -->
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
	disabled: {
		type: Boolean,
		default: false,
	},
});
// const isRequired = (value) => {
//   if (value && value.trim()) {
//     return true
//   }
//   return 'This is required right now!'
// }
</script>
<style>
.input-container {
	.input {
		@apply block w-full text-lg md:text-base border-gray-300  rounded-md shadow-sm placeholder:text-gray-400 ;
	}
	.error {
		font-size: 8px;
		line-height: 10px;

		right: 0px;
		bottom: -12px;
		color: var(--gray);
		@apply absolute uppercase tracking-wide font-bold;
	}
}
</style>
