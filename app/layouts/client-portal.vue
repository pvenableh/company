<template>
	<!-- The classic portal shell has been removed; the portal now always renders
	     the apps shell. Pages opt in with `definePageMeta({ layout: 'client-portal' })`. -->
	<LayoutPortalAppsShell>
		<slot />
	</LayoutPortalAppsShell>
</template>
