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
			<h5 class="web-designer">
				<a href="https://huestudios.com" target="_blank" rel="noopener" class="columns shrink body-font">
					designed by
					<svg id="hue-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 98.44 48.62">
						<title>hue Creative Marketing - New York | Miami</title>
						<path
							class="h"
							d="M347.41,282.12h6.28v19.35c2-3.5,6.14-5.48,10.77-5.48,3.5,0,8.52,1.25,10.44,5.28.66,1.32,1.12,2.91,1.12,7.73v20.74h-3.56c-5.61,0-2.78-19.62-2.78-19.62,0-3,0-9.38-7.13-9.38a8.57,8.57,0,0,0-7.79,4.43c-1.06,1.85-1.06,5-1.06,7v17.57h-6.28Z"
							transform="translate(-347.41 -282.12)"
						/>
						<path
							class="h"
							d="M388.17,296.59v21.34c0,3.24.73,7.33,7.07,7.33,3.1,0,6-1.06,7.79-3.7,1.39-2,1.39-4.56,1.39-6.21,0,0-1.87-18.76,2.07-18.76h4.33v27c0,.66.13,4.36.2,6.21h-6.47l-.13-5.68c-1.19,2.31-3.44,6-10.57,6-8.19,0-12-4.69-12-11.23V296.59Z"
							transform="translate(-347.41 -282.12)"
						/>
						<path
							class="h"
							d="M422,314.29c-.13,6.87,2.71,12,9.51,12,5.93,0,6.3-6.87,9.67-6.87h4.33a11.26,11.26,0,0,1-2.84,6.94c-1.45,1.65-4.76,4.43-11.43,4.43-10.44,0-15.39-6.47-15.39-17,0-6.54,1.32-12,6.54-15.59,3.17-2.25,7.13-2.44,9.05-2.44,14.86,0,14.53,13.15,14.4,18.56Zm17.51-4.36c.07-3.17-.53-9.78-8.19-9.78-4,0-8.92,2.44-9,9.78Z"
							transform="translate(-347.41 -282.12)"
						/>
					</svg>
				</a>
			</h5>
			<h5 class="tracking-widest uppercase body-font copyright">
				&#169; {{ new Date().getFullYear() }} HUESTUDIOS, LLC
			</h5>
		</div>
	</div>
</template>
<script setup>
const { data, status } = useAuth();
const user = computed(() => {
	return status.value === 'authenticated' ? data?.value?.user ?? null : null;
});

const { logout } = useLogout();

const props = defineProps({
	links: {
		type: Array,
		default: () => [],
	},
});
</script>
<style scoped>
.footer {
	position: relative;

	&__col {
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

	&__contact-info {
		h5 {
			font-size: 9px;
			@apply uppercase tracking-wider font-bold px-2;
		}
	}
}

h5.web-designer {
	margin-top: 0px;
	margin-bottom: 0px;
	letter-spacing: 0.2em;

	a {
		font-size: 10px;
		svg {
			width: 35px;
			height: auto;
			display: inline;
			stroke: none;
			margin-top: -11px;
			margin-left: 3px;
			@apply fill-gray-700 dark:fill-gray-400;
			path {
				transition: all 0.3s linear;
			}

			path:nth-of-type(1) {
				transition-delay: 0.1s;
			}

			path:nth-of-type(2) {
				transition-delay: 0.2s;
			}

			path:nth-of-type(3) {
				transition-delay: 0.3s;
			}
		}
	}

	a:hover {
		svg path {
			fill: rgb(255, 0, 92);
		}
	}
}

h5.copyright {
	font-size: 9px;
	margin-top: 0px;
	margin-bottom: 50px;
	letter-spacing: 0.3em;
}
</style>
