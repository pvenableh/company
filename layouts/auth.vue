<template>
	<div
		class="dark:bg-gray-800 dark:text-white min-h-screen w-full transition duration-150 bg-white flex items-center justify-start flex-col relative"
	>
		<div class="w-full flex items-center justify-center flex-col min-h-screen page__content">
			<LayoutHeader />
			<div class="w-full mx-auto min-h-screen relative px-4 md:px-6">
				<slot />
			</div>
			<LayoutFooter />
			<LayoutMobileToolbar />
			<LayoutNavButton @click="isOpen = true" />
		</div>
		<USlideover v-model="isOpen">
			<LayoutNavDrawer :class="{ opened: isOpen }" @click="isOpen = false" />
		</USlideover>
	</div>
</template>
<script setup lang="ts">
const { user } = useDirectusAuth();
const isOpen = ref(false);
</script>
<style>
.page {
	overflow: hidden;
	width: 100%;

	&__content {
		transition: all 0.65s var(--curve);

		&-title {
		}
	}

	&__nav {
		width: 250px;
		@apply pt-10 mt-10 top-0;
		display: none;

		@media (min-width: theme('screens.lg')) {
			display: flex;
		}

		a {
			@apply w-full tracking-wider text-xs py-2;
		}

		h5 {
		}
	}

	&__content-title {
		@apply uppercase text-center tracking-wide mt-12 py-6 w-full;
		@media (min-width: theme('screens.lg')) {
			/* margin-left: 240px; */
		}
	}

	&__content-body {
		max-width: 800px;
		@media (min-width: theme('screens.lg')) {
			border-left: thin solid var(--grey);
		}

		h1 {
			font-size: 24px;
			letter-spacing: 0.05em;
			@apply pt-10 mt-10 uppercase font-bold;
		}

		h2 {
			font-size: 20px;
			text-decoration: none !important;
			letter-spacing: 0.05em;
			@apply mt-6 uppercase font-bold;
		}

		h3 {
			font-size: 16px;
			text-decoration: none !important;
			letter-spacing: 0.05em;
			@apply mt-6 uppercase font-bold;
		}

		p {
			line-height: 1.8em;
			@apply my-2;
		}

		ol,
		ul {
			@apply ml-8;
			list-style-type: disc;

			li {
				@apply pl-2 my-2;
			}
		}

		ol {
			list-style-type: decimal;
		}

		a {
			text-decoration: underline;
			color: var(--blue);
		}
	}
}
</style>
