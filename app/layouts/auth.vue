<!-- layouts/auth.vue — Clean white auth layout with animated chart background -->
<template>
	<div class="auth-layout">
		<!-- Floating blurred background -->
		<div class="auth-bg" aria-hidden="true">
			<div class="auth-blob auth-blob-1" />
			<div class="auth-blob auth-blob-2" />
			<div class="auth-blob auth-blob-3" />
			<div class="auth-blob auth-blob-4" />
			<div class="auth-blob auth-blob-5" />
			<div class="auth-blob auth-blob-6" />
			<div class="auth-blob auth-blob-7" />
		</div>

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

:is(.dark) .auth-layout {
	--background: 0 0% 5%;
	--foreground: 0 0% 93%;
	--card: 0 0% 8%;
	--card-foreground: 0 0% 93%;
	--primary: 0 0% 93%;
	--primary-foreground: 0 0% 5%;
	--secondary: 0 0% 12%;
	--secondary-foreground: 0 0% 93%;
	--muted: 0 0% 15%;
	--muted-foreground: 0 0% 55%;
	--accent: 0 0% 15%;
	--accent-foreground: 0 0% 93%;
	--border: 0 0% 18%;
	--input: 0 0% 18%;
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
	font-family: var(--font-signature);
	font-size: 13px;
	line-height: 1;
	letter-spacing: 0.02em;
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

/* ── Floating blurred blobs — centered origin ── */
.auth-bg {
	position: absolute;
	inset: 0;
	overflow: hidden;
	pointer-events: none;
	z-index: 0;
}

.auth-blob {
	position: absolute;
	border-radius: 50%;
	filter: blur(90px);
	will-change: transform;
	/* All blobs originate from center */
	top: 50%;
	left: 50%;
}

.auth-blob-1 {
	width: 420px;
	height: 420px;
	background: #61f7ff;
	margin-top: -210px;
	margin-left: -210px;
	opacity: 0.25;
	animation: auth-drift-1 22s ease-in-out infinite;
}

.auth-blob-2 {
	width: 360px;
	height: 360px;
	background: #1ac5ff;
	margin-top: -180px;
	margin-left: -180px;
	opacity: 0.25;
	animation: auth-drift-2 26s ease-in-out infinite;
}

.auth-blob-3 {
	width: 300px;
	height: 300px;
	background: #009ff5;
	margin-top: -150px;
	margin-left: -150px;
	opacity: 0.2;
	animation: auth-drift-3 19s ease-in-out infinite;
}

.auth-blob-4 {
	width: 250px;
	height: 250px;
	background: #0073d1;
	margin-top: -125px;
	margin-left: -125px;
	opacity: 0.18;
	animation: auth-drift-4 24s ease-in-out infinite;
}

.auth-blob-5 {
	width: 200px;
	height: 200px;
	background: #85fff9;
	margin-top: -100px;
	margin-left: -100px;
	opacity: 0.15;
	animation: auth-drift-5 20s ease-in-out infinite;
}

.auth-blob-6 {
	width: 320px;
	height: 320px;
	background: #a8fff2;
	margin-top: -160px;
	margin-left: -160px;
	opacity: 0.12;
	animation: auth-drift-6 28s ease-in-out infinite;
}

.auth-blob-7 {
	width: 180px;
	height: 180px;
	background: #004ead;
	margin-top: -90px;
	margin-left: -90px;
	opacity: 0.2;
	animation: auth-drift-7 17s ease-in-out infinite;
}

:is(.dark) .auth-blob { opacity: 0.08 !important; }

@keyframes auth-drift-1 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	25% { transform: translate(-120px, -80px) scale(1.1); }
	50% { transform: translate(60px, -150px) scale(0.95); }
	75% { transform: translate(100px, 60px) scale(1.05); }
}

@keyframes auth-drift-2 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	25% { transform: translate(140px, 70px) scale(1.08); }
	50% { transform: translate(-80px, 130px) scale(0.92); }
	75% { transform: translate(-130px, -50px) scale(1.04); }
}

@keyframes auth-drift-3 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	33% { transform: translate(-160px, 100px) scale(1.06); }
	66% { transform: translate(120px, -90px) scale(0.94); }
}

@keyframes auth-drift-4 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	33% { transform: translate(100px, -140px) scale(1.1); }
	66% { transform: translate(-110px, 80px) scale(0.9); }
}

@keyframes auth-drift-5 {
	0%, 100% { transform: translate(0, 0); }
	25% { transform: translate(-90px, -110px); }
	50% { transform: translate(130px, 40px); }
	75% { transform: translate(50px, 120px); }
}

@keyframes auth-drift-6 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	50% { transform: translate(-100px, -70px) scale(1.12); }
}

@keyframes auth-drift-7 {
	0%, 100% { transform: translate(0, 0); }
	25% { transform: translate(80px, 100px); }
	50% { transform: translate(-70px, 140px); }
	75% { transform: translate(110px, -60px); }
}
</style>
