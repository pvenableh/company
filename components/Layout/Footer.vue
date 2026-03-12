<template>
	<div
		class="w-full flex flex-col md:flex-row flex-wrap items-start justify-start sm:justify-center px-4 md:px-6 pb-10 mt-16 md:mt-20 text-gray-700 dark:text-gray-400 footer"
	>
		<div class="flex items-start justify-start flex-col footer__col">
			<nuxt-link v-for="(link, index) in links" :key="index" :to="link.to">{{ link.name }}</nuxt-link>
		</div>
		<div class="flex items-start justify-start flex-col footer__col">
			<nuxt-link to="/organization">Organization</nuxt-link>
			<nuxt-link v-if="user" to="/account">Account</nuxt-link>
			<a @click.prevent="logout" v-if="user" class="cursor-pointer">Logout</a>
			<nuxt-link v-else to="/auth/signin">Login</nuxt-link>
		</div>
		<div class="w-full flex items-center justify-center flex-col sm:flex-row my-12 footer__contact-info">
			<h5>605 Lincoln Road Suite 200</h5>
			<h5>Miami Beach, FL</h5>
			<h5>33139</h5>
			<h5>305.680.0485</h5>
		</div>
		<div class="flex w-full flex-col items-center justify-center">
			<nuxt-link to="/" class="mb-3 text-foreground hover:text-primary transition-colors">
				<LogoEarnest size="sm" />
			</nuxt-link>
			<p class="text-[10px] tracking-wider text-muted-foreground mb-1">Do good work.</p>
			<h5 class="tracking-widest uppercase body-font copyright">
				&#169; {{ new Date().getFullYear() }} Earnest
			</h5>
		</div>
	</div>
</template>
<script setup>
const { user } = useDirectusAuth();

const { logout } = useLogout();

const props = defineProps({
	links: {
		type: Array,
		default: () => [],
	},
});
</script>
<style scoped>
@reference "~/assets/css/tailwind.css";
.footer {
	position: relative;
}

.footer__col {
	text-align: center;
	@apply w-full;
	@media (min-width: theme('screens.md')) {
		max-width: 250px;
	}

	a {
		font-size: 10px;

		@apply uppercase tracking-widest py-1 mb-1 w-full;
	}
	a:hover,
	a.active,
	a.router-link-exact-active {
		color: var(--blue);
	}
}

.footer__contact-info {
	h5 {
		font-size: 9px;
		@apply uppercase tracking-wider font-bold px-2;
	}
}

h5.copyright {
	font-size: 9px;
	margin-top: 0px;
	margin-bottom: 50px;
	letter-spacing: 0.3em;
}
</style>
