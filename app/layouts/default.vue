<template>
	<!-- The classic layout has been removed. `default` now always renders the
	     apps shell, so any page with `layout: 'default'` (or no explicit layout)
	     gets the apps layout; pages that set `layout: 'apps'` render it directly.
	     The apps layout already mounts every global the old classic branch did
	     (Earnest panel, time tracker, token modal, floating dock, spotlight). -->
	<NuxtLayout name="apps">
		<slot />
	</NuxtLayout>
</template>
