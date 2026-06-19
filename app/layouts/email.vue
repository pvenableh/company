<template>
	<div class="min-h-screen w-full transition duration-150 bg-white flex items-stretch justify-start flex-col relative">
		<slot />
		<!-- Unified Earnest panel (email pages open it via sidebarOpen) -->
		<ClientOnly>
			<AIEarnestPanel />
		</ClientOnly>
	</div>
</template>
<script setup lang="ts"></script>
<style></style>
