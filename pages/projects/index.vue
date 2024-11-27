<script setup>
const { readItems } = useDirectusItems();
const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});

// const organizations = computed(() => {
// 	return user.value.organizations.map((org) => org.organizations_id.id);
// });

// const userOrganizationIds = user.value.organizations.map((org) => org.organizations_id.id);

// console.log(userOrganizationIds);

// const projects = await readItems('projects', {
// 	fields: ['*'],
// 	filter: {
// 		organization: {
// 			_eq: userOrganizationIds[0],
// 		},
// 		status: {
// 			_in: ['published', 'draft'],
// 		},
// 	},
// 	sort: ['-created_on'],
// });
// console.log(projects);
</script>
<template>
	<div class="md:px-6 mx-auto flex items-start justify-center flex-col relative px-4 pt-20">
		<h1 class="page__title">Projects</h1>
		<div class="w-full flex flex-col items-center lg:items-start justify-center z-10 page__inner">
			<h4 class="uppercase w-full text-center tracking-wide">Coming soon.</h4>
		</div>
	</div>
</template>
<style scoped>
.projects {
	@media (min-width: theme('screens.md')) {
	}
}
</style>
