<template>
	<div class="ios-overlay" @click="$emit('close')" />
</template>

<script setup>
defineEmits(['close']);
</script>

<style scoped>
.ios-overlay {
	position: fixed;
	inset: 0;
	z-index: 20;
	background: rgba(0, 0, 0, 0.25);
	cursor: pointer;
	-webkit-tap-highlight-color: transparent;
}
</style>
