<script setup>
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
</script>
<template>
	<div class="min-h-screen t-bg t-text">
		<!-- Marketing Page: shown when user is NOT logged in -->
		<PagesSellSheet v-if="!user" />

		<!-- Dashboard: shown when user IS logged in -->
		<div v-else class="md:px-6 mx-auto flex items-start justify-center flex-col relative px-4 pt-20">
			<h1 class="page__title">Dashboard</h1>
			<div class="w-full flex flex-col items-center min-h-svh z-10 !mt-0 justify-start page__inner">
				<div class="w-full max-w-[1200px]">
					<h2 class="text-lg uppercase tracking-wide mb-2 font-thin">{{ greetUser() }} {{ user.first_name }}.</h2>
					<div class="">
						<h5
							class="w-full mb-2 uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-wider text-[10px]"
						>
							Ticket Activity:
						</h5>
						<TicketsDashboard />
					</div>
					<div class="gap-6 grid-cols-1 sm:grid-cols-2 hidden">
						<nuxt-link
							to="/invoices"
							class="bg-gray-100 text-center py-12 sm:py-20 uppercase tracking-wide rounded-md shadow-lg"
						>
							Invoices
						</nuxt-link>
						<nuxt-link
							to="/projects"
							class="bg-gray-100 text-center py-12 sm:py-20 uppercase tracking-wide rounded-md shadow-lg"
						>
							Projects
						</nuxt-link>
						<nuxt-link
							to="/tickets"
							class="bg-gray-100 text-center py-12 sm:py-20 uppercase tracking-wide rounded-md shadow-lg"
						>
							Tickets
						</nuxt-link>
						<nuxt-link
							to="/channels"
							class="bg-gray-100 text-center py-12 sm:py-20 uppercase tracking-wide rounded-md shadow-lg"
						>
							Channels
						</nuxt-link>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<style>
@reference "~/assets/css/tailwind.css";
.home {
	.building {
		max-width: 350px;

		@media (min-width: theme('screens.sm')) {
			max-width: 575px;
		}

		@media (min-width: theme('screens.md')) {
			max-width: 575px;
		}

		@media (min-width: theme('screens.lg')) {
			max-width: 600px;
		}
	}

	.temp-heading {
		font-size: 12px;
		bottom: 0px;
		@apply uppercase tracking-wide;
		max-width: 400px;

		@media (min-width: theme('screens.md')) {
			max-width: 400px;
		}

		@media (min-width: theme('screens.lg')) {
			max-width: 440px;
		}
	}

	.logo {
		max-width: 400px;
		@apply px-6 mt-8;

		@media (min-width: theme('screens.md')) {
			max-width: 400px;
		}

		@media (min-width: theme('screens.lg')) {
			max-width: 600px;
		}

		path {
			opacity: 0.4;
			animation-name: example;
			animation-duration: 5s;
			animation-timing-function: var(--curve);
			animation-iteration-count: infinite;
		}

		path:nth-of-type(1) { animation-delay: 0.1s; }
		path:nth-of-type(2) { animation-delay: 0.2s; }
		path:nth-of-type(3) { animation-delay: 0.3s; }
		path:nth-of-type(4) { animation-delay: 0.4s; }
		path:nth-of-type(5) { animation-delay: 0.5s; }
		path:nth-of-type(6) { animation-delay: 0.6s; }
		path:nth-of-type(7) { animation-delay: 0.7s; }
		path:nth-of-type(8) { animation-delay: 0.8s; }
		path:nth-of-type(9) { animation-delay: 0.9s; }
		path:nth-of-type(10) { animation-delay: 1s; }
	}

	@keyframes example {
		0% { opacity: 0.4; }
		50% { opacity: 1; }
		100% { opacity: 0.4; }
	}
}
</style>
