<template>
	<div class="min-h-screen w-full transition duration-150 bg-white flex items-stretch justify-start flex-col relative">
		<slot />
		<!-- Docked Earnest panel retired — email pages that open Earnest (via
		     sidebarOpen / openEarnestPanel) now get Focus, mounted globally in
		     app.vue as EarnestCoachingTakeover. -->
	</div>
</template>
<script setup lang="ts"></script>
<style></style>
