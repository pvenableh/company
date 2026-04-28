<template>
	<footer class="w-full mt-12">
		<div class="max-w-screen-xl mx-auto px-6 py-12">
			<!-- Top section: Brand + Nav -->
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
				<!-- Brand -->
				<div>
					<nuxt-link to="/" class="group">
						<span class="text-2xl font-bold text-foreground" style="font-family: var(--font-bauer-bodoni)">
							Earnest<span class="text-primary">.</span>
						</span>
					</nuxt-link>
					<p class="text-xs text-muted-foreground mt-2" style="font-family: var(--font-signature)">Do good work.</p>
				</div>

				<!-- Logged-in nav columns -->
				<template v-if="isLoggedIn">
					<div class="space-y-2.5">
						<span class="text-[10px] font-semibold uppercase tracking-wider text-foreground">Platform</span>
						<div class="flex flex-col gap-1.5">
							<nuxt-link v-for="link in platformLinks" :key="link.to" :to="link.to" class="text-xs text-muted-foreground hover:text-foreground transition-colors">
								{{ link.label }}
							</nuxt-link>
						</div>
					</div>
					<div class="space-y-2.5">
						<span class="text-[10px] font-semibold uppercase tracking-wider text-foreground">Tools</span>
						<div class="flex flex-col gap-1.5">
							<nuxt-link v-for="link in toolLinks" :key="link.to" :to="link.to" class="text-xs text-muted-foreground hover:text-foreground transition-colors">
								{{ link.label }}
							</nuxt-link>
						</div>
					</div>
					<div class="space-y-2.5">
						<span class="text-[10px] font-semibold uppercase tracking-wider text-foreground">Account</span>
						<div class="flex flex-col gap-1.5">
							<nuxt-link v-for="link in accountLinks" :key="link.to" :to="link.to" class="text-xs text-muted-foreground hover:text-foreground transition-colors">
								{{ link.label }}
							</nuxt-link>
						</div>
					</div>
				</template>

				<!-- Marketing nav -->
				<template v-else>
					<div class="space-y-2.5">
						<span class="text-[10px] font-semibold uppercase tracking-wider text-foreground">Product</span>
						<div class="flex flex-col gap-1.5">
							<nuxt-link to="/auth/signin" class="text-xs text-muted-foreground hover:text-foreground transition-colors">Login</nuxt-link>
							<nuxt-link to="/register" class="text-xs text-muted-foreground hover:text-foreground transition-colors">Get Started</nuxt-link>
						</div>
					</div>
				</template>
			</div>

			<!-- Bottom bar -->
			<div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-border/20">
				<p class="text-[10px] text-muted-foreground/50 tracking-wide">
					&copy; {{ new Date().getFullYear() }} Earnest. All rights reserved.
				</p>
				<div class="flex items-center gap-4">
					<a href="mailto:hello@earnest.guru" class="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors tracking-wide">
						hello@earnest.guru
					</a>
					<span class="text-muted-foreground/20">|</span>
					<a
						href="mailto:hello@earnest.guru"
						target="_blank"
						rel="noopener"
						class="inline-flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-primary transition-colors tracking-wider"
					>
						designed by
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 98.44 48.62" class="h-3 w-auto fill-current">
							<path d="M347.41,282.12h6.28v19.35c2-3.5,6.14-5.48,10.77-5.48,3.5,0,8.52,1.25,10.44,5.28.66,1.32,1.12,2.91,1.12,7.73v20.74h-3.56c-5.61,0-2.78-19.62-2.78-19.62,0-3,0-9.38-7.13-9.38a8.57,8.57,0,0,0-7.79,4.43c-1.06,1.85-1.06,5-1.06,7v17.57h-6.28Z" transform="translate(-347.41 -282.12)" />
							<path d="M388.17,296.59v21.34c0,3.24.73,7.33,7.07,7.33,3.1,0,6-1.06,7.79-3.7,1.39-2,1.39-4.56,1.39-6.21,0,0-1.87-18.76,2.07-18.76h4.33v27c0,.66.13,4.36.2,6.21h-6.47l-.13-5.68c-1.19,2.31-3.44,6-10.57,6-8.19,0-12-4.69-12-11.23V296.59Z" transform="translate(-347.41 -282.12)" />
							<path d="M422,314.29c-.13,6.87,2.71,12,9.51,12,5.93,0,6.3-6.87,9.67-6.87h4.33a11.26,11.26,0,0,1-2.84,6.94c-1.45,1.65-4.76,4.43-11.43,4.43-10.44,0-15.39-6.47-15.39-17,0-6.54,1.32-12,6.54-15.59,3.17-2.25,7.13-2.44,9.05-2.44,14.86,0,14.53,13.15,14.4,18.56Zm17.51-4.36c.07-3.17-.53-9.78-8.19-9.78-4,0-8.92,2.44-9,9.78Z" transform="translate(-347.41 -282.12)" />
						</svg>
					</a>
				</div>
			</div>
		</div>
	</footer>
</template>

<script setup>
const { user: sessionUser, loggedIn } = useUserSession();
const isLoggedIn = computed(() => loggedIn.value && sessionUser.value);

const platformLinks = [
	{ to: '/tickets', label: 'Tickets' },
	{ to: '/projects', label: 'Projects' },
	{ to: '/scheduler', label: 'Scheduler' },
	{ to: '/financials', label: 'Financials' },
];

const toolLinks = [
	{ to: '/invoices', label: 'Invoices' },
	{ to: '/email', label: 'Email' },
	{ to: '/contacts', label: 'Contacts' },
	{ to: '/clients', label: 'Clients' },
];

const accountLinks = [
	{ to: '/organization', label: 'Organization' },
	{ to: '/account', label: 'Account' },
];
</script>
