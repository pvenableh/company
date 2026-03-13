<template>
	<footer class="site-footer">
		<div class="footer-grid">
			<div>
				<nuxt-link to="/" class="footer-brand-link">
					<div class="footer-brand">Earnest<span class="footer-accent">.</span></div>
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
		<p class="footer-copy">&copy; {{ new Date().getFullYear() }} Earnest. A platform that means it.</p>
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
	border-top: 1px solid hsl(var(--border) / 0.4);
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
</style>
