<template>
	<div id="screen" class="fixed h-screen w-full screen cursor-pointer">Peter</div>
</template>
<script setup></script>
<style scoped>
.screen {
	/* background-color: rgba(89, 89, 89, 0.4);
	background-color: rgba(255, 255, 255, 0.75); */
	background: rgba(208, 208, 208, 0.5);
	/* opacity: 0.999999; */
	/* transition: all 0.95s var(--curve); */
	top: 0px;
	left: 0px;
	/* backdrop-filter: blur(2px); */
	z-index: 20;

	@supports (-webkit-backdrop-filter: none) or (backdrop-filter: none) {
		-webkit-backdrop-filter: blur(2px);
		backdrop-filter: blur(2px);
		/* background-color: rgba(255, 255, 255, 0.5); */
	}
}

/* .screen.open {
	visibility: visible;
  } */
</style>
