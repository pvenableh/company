<template>
	<div>
		<input v-model="url" placeholder="Enter URL" />
		<button @click="applyLink">Apply</button>
		<button @click="removeLink">Remove</button>
	</div>
</template>

<script>
import { defineComponent, ref } from 'vue';

export default defineComponent({
	props: {
		editor: {
			type: Object,
			required: true,
		},
	},
	setup(props) {
		const url = ref('');

		const applyLink = () => {
			if (url.value) {
				props.editor.chain().focus().setLink({ href: url.value }).run();
			}

			url.value = '';
		};

		const removeLink = () => {
			props.editor.chain().focus().unsetLink().run();
			url.value = '';
		};

		return {
			url,
			applyLink,
			removeLink,
		};
	},
});
</script>

<style scoped>
/* Add any styles for your component here */
</style>
