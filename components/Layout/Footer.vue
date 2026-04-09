<template>
	<footer class="site-footer">
		<div class="footer-grid">
			<div>
				<nuxt-link to="/" class="footer-brand-link">
					<div class="footer-brand">
						Earnest
						<span class="footer-accent">.</span>
					</div>
				</nuxt-link>
				<div class="footer-tagline">Do good work.</div>
			</div>
			<!-- Logged-in nav -->
			<div v-if="user" class="footer-nav">
				<div class="footer-col">
					<span class="footer-col-title">Platform</span>
					<nuxt-link to="/tickets">Tickets</nuxt-link>
					<nuxt-link to="/projects">Projects</nuxt-link>
					<nuxt-link to="/channels">Channels</nuxt-link>
					<nuxt-link to="/scheduler">Scheduler</nuxt-link>
					<nuxt-link to="/dashboard">Statistics</nuxt-link>
				</div>
				<div class="footer-col">
					<span class="footer-col-title">Tools</span>
					<nuxt-link to="/invoices">Invoices</nuxt-link>
					<nuxt-link to="/command-center/financials">Financials</nuxt-link>
					<nuxt-link to="/email">Email</nuxt-link>
					<nuxt-link to="/social/dashboard">Social</nuxt-link>
					<nuxt-link to="/contacts">Contacts</nuxt-link>
					<nuxt-link to="/clients">Clients</nuxt-link>
				</div>
				<div class="footer-col">
					<span class="footer-col-title">Account</span>
					<nuxt-link to="/organization">Organization</nuxt-link>
					<nuxt-link to="/account">Account</nuxt-link>
					<a @click.prevent="logout" class="cursor-pointer">Logout</a>
				</div>
			</div>
			<!-- Marketing nav -->
			<div v-else class="footer-nav">
				<div class="footer-col">
					<span class="footer-col-title">Product</span>
					<nuxt-link to="#features">Features</nuxt-link>
					<nuxt-link to="#pricing">Pricing</nuxt-link>
					<nuxt-link to="/register">Get Started</nuxt-link>
				</div>
				<div class="footer-col">
					<span class="footer-col-title">Platform</span>
					<nuxt-link to="#features">Projects</nuxt-link>
					<nuxt-link to="#features">Invoicing</nuxt-link>
					<nuxt-link to="#features">Channels</nuxt-link>
				</div>
				<div class="footer-col">
					<span class="footer-col-title">Account</span>
					<nuxt-link to="/auth/signin">Login</nuxt-link>
					<nuxt-link to="/register">Register</nuxt-link>
				</div>
			</div>
		</div>
		<p class="footer-copy">Earnest. A platform that means it.</p>
		<div class="my-12 flex w-full flex-col items-center justify-center">
			<h5 class="web-designer !font-[var(--theme-body-font)]">
				<a
					href="mailto:hello@earnest.guru"
					target="_blank"
					rel="noopener"
					class="columns body-font shrink !text-white !font-[var(--theme-body-font)]"
				>
					designed by
					<svg id="hue-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 98.44 48.62">
						<title>hue Creative Marketing - Maimi Beach | New York</title>
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
			<h5 class="!font-[var(--theme-body-font)] copyright tracking-widest uppercase mb-safe-offset-12 !text-white">
				&#169; {{ new Date().getFullYear() }} Hue Creative, Inc. All rights reserved.
			</h5>
		</div>
	</footer>
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

.site-footer {
	max-width: 1200px;
	margin: 60px auto 0;
	width: 100%;
	flex-direction: column;
}

.footer-grid {
	padding: 60px 48px 0;
	display: grid;
	grid-template-columns: 1fr;
	gap: 48px;
}
@media (min-width: 601px) {
	.footer-grid {
		grid-template-columns: 1fr 2fr;
		align-items: start;
	}
}
@media (max-width: 600px) {
	.footer-grid {
		padding: 48px 24px 0;
	}
}

.footer-brand-link {
	text-decoration: none;
	color: hsl(var(--foreground));
	transition: color 0.2s;
}
.footer-brand-link:hover {
	color: hsl(var(--primary));
}

.footer-brand {
	font-family: var(--font-bauer-bodoni);
	font-size: 36px;
	font-weight: 600;
	letter-spacing: 0.01em;
	color: hsl(var(--foreground));
}

.footer-accent {
	color: hsl(var(--primary));
}

.footer-tagline {
	font-family: var(--font-proxima-light);
	font-style: italic;
	font-size: 14px;
	color: hsl(var(--muted-foreground));
	margin-top: 8px;
}

.footer-nav {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 32px;
}
@media (max-width: 600px) {
	.footer-nav {
		grid-template-columns: repeat(2, 1fr);
	}
}

.footer-col {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.footer-col-title {
	font-family: var(--font-bauer-bodoni);
	font-size: 13px;
	font-weight: 600;
	color: hsl(var(--foreground));
	letter-spacing: 0.02em;
	margin-bottom: 4px;
}

.footer-col a {
	font-family: var(--font-proxima-light);
	font-size: 13px;
	color: hsl(var(--muted-foreground));
	text-decoration: none;
	letter-spacing: 0.04em;
	transition: color 0.2s;
}

.footer-col a:hover {
	color: hsl(var(--foreground));
}

.footer-copy {
	font-size: 12px;
	color: hsl(var(--muted-foreground));
	letter-spacing: 0.04em;
	opacity: 0.6;
	padding: 40px 48px calc(40px + 72px);
	text-align: center;
	font-family: var(--font-proxima-light);
	font-style: italic;
}
@media (min-width: 769px) {
	.footer-copy {
		padding-bottom: 40px;
	}
}
h5.web-designer {
	margin-top: 0px;
	margin-bottom: 0px;
	letter-spacing: 0.15em;

	a,
	a:link,
	a:visited {
		font-size: 10px;
		color: var(--grey);
		svg {
			width: 35px;
			height: auto;
			display: inline;
			stroke: none;
			margin-top: -11px;
			margin-left: 1px;
			fill: #ffffff;
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
	font-size: 7px;
	margin-top: 0px;
	margin-bottom: 50px;
	letter-spacing: 0.25em;
}
</style>
