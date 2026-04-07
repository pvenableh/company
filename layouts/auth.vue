<!-- layouts/auth.vue — Clean white auth layout with animated chart background -->
<template>
	<div class="auth-layout">
		<!-- Animated chart background (client-only to avoid SSR issues) -->
		<ClientOnly>
			<AuthAnimatedChartBg />
		</ClientOnly>

		<main class="auth-content">
			<nuxt-link to="/" class="auth-brand">
				<LogoEarnest size="lg" />
				<span class="auth-tagline">Do good work.</span>
			</nuxt-link>
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
	--background: 0 0% 100%;
	--foreground: 0 0% 9%;
	--card: 0 0% 100%;
	--card-foreground: 0 0% 9%;
	--primary: 0 0% 9%;
	--primary-foreground: 0 0% 98%;
	--secondary: 0 0% 96%;
	--secondary-foreground: 0 0% 9%;
	--muted: 0 0% 96%;
	--muted-foreground: 0 0% 45%;
	--accent: 0 0% 96%;
	--accent-foreground: 0 0% 9%;
	--border: 0 0% 90%;
	--input: 0 0% 90%;
	--ring: 180 50% 50%;

	position: relative;
	min-height: 100svh;
	display: flex;
	flex-direction: column;
	background: hsl(var(--background));
	color: hsl(var(--foreground));
	-webkit-font-smoothing: antialiased;
	overflow: hidden;
}

.auth-content {
	position: relative;
	z-index: 1;
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 48px 16px 24px;
}

.auth-brand {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-decoration: none;
	color: hsl(var(--foreground));
	margin-bottom: 40px;
}

.auth-tagline {
	font-family: var(--font-proxima-light);
	font-style: italic;
	font-size: 11px;
	letter-spacing: 0.06em;
	color: hsl(var(--muted-foreground));
	margin-top: 4px;
}

.auth-footer {
	position: relative;
	z-index: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 16px 24px;
	font-size: 11px;
	letter-spacing: 0.04em;
	color: hsl(var(--muted-foreground));
}

.auth-footer a {
	color: hsl(var(--muted-foreground));
	text-decoration: none;
	transition: color 0.15s;
}

.auth-footer a:hover {
	color: hsl(var(--foreground));
}

.auth-footer-sep {
	opacity: 0.4;
}
</style>
