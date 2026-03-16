<!-- layouts/auth.vue — Earnest-branded auth layout -->
<template>
	<div class="auth-layout">
		<header class="auth-header">
			<nuxt-link to="/" class="auth-brand">
				<LogoEarnest size="md" />
				<span class="auth-tagline">Do good work.</span>
			</nuxt-link>
		</header>
		<main class="auth-content">
			<slot />
		</main>
		<footer class="auth-footer">
			<span>&copy; {{ new Date().getFullYear() }} Earnest</span>
			<span class="auth-footer-sep">&middot;</span>
			<nuxt-link to="/">Home</nuxt-link>
		</footer>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.auth-layout {
	/* ── Earnest Sellsheet Palette ── */
	--paper: #F6F1E7;
	--paper-2: #EDE7D9;
	--ink: #1C1812;
	--ink-2: #3D3529;
	--muted: #8C7B6B;
	--accent: #B85C2C;
	--rule: rgba(28, 24, 18, 0.12);

	/* ── Override shadcn/ui tokens so child components inherit the Earnest theme ── */
	--background: 40 46% 93%;        /* paper */
	--foreground: 36 22% 9%;         /* ink */
	--card: 39 33% 95%;              /* slightly lighter than paper */
	--card-foreground: 36 22% 9%;    /* ink */
	--primary: 21 61% 45%;           /* accent — warm terracotta */
	--primary-foreground: 40 46% 96%; /* light cream on accent */
	--secondary: 39 35% 89%;         /* paper-2 */
	--secondary-foreground: 36 17% 20%; /* ink-2 */
	--muted: 39 35% 89%;             /* paper-2 */
	--muted-foreground: 29 14% 48%;  /* muted brown */
	--accent: 39 35% 89%;
	--accent-foreground: 36 17% 20%;
	--border: 34 20% 82%;            /* warm border */
	--input: 34 20% 82%;             /* warm input border */
	--ring: 21 61% 45%;              /* accent for focus ring */

	min-height: 100svh;
	display: flex;
	flex-direction: column;
	background: var(--paper);
	color: var(--ink);
	font-family: var(--font-proxima-light);
	-webkit-font-smoothing: antialiased;
}

.auth-header {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 24px 24px 0;
}

.auth-brand {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-decoration: none;
	color: var(--ink);
}

.auth-tagline {
	font-family: var(--font-proxima-light);
	font-style: italic;
	font-size: 9px;
	letter-spacing: 0.06em;
	color: var(--muted);
	margin-top: 1px;
}

.auth-content {
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 24px 16px;
}

.auth-footer {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 16px 24px;
	font-size: 11px;
	letter-spacing: 0.04em;
	color: var(--muted);
}

.auth-footer a {
	color: var(--muted);
	text-decoration: none;
	transition: color 0.15s;
}

.auth-footer a:hover {
	color: var(--ink);
}

.auth-footer-sep {
	opacity: 0.5;
}
</style>
