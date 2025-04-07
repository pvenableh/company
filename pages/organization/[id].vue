<script setup>
const { readItem } = useDirectusItems();
const { params } = useRoute();
const { data: authData, status } = useAuth();
const user = computed(() => {
	return status.value === 'authenticated' ? authData?.value?.user ?? null : null;
});

const { selectedOrg, hasMultipleOrgs, organizationOptions, setOrganization, clearOrganization, getOrganizationFilter } =
	useOrganization();

definePageMeta({
	middleware: ['auth'],
	layout: 'default',
});

const org = await readItem('organization', params.id, {
	fields: [
		'*,users.directus_users_id.id,users.directus_users_id.first_name,users.directus_users_id.last_name,users.directus_users_id.avatar,users.directus_users_id.email',
	],
});
</script>
<template>
	<div class="md:px-6 mx-auto flex items-start justify-center flex-col relative px-4 pt-20">
		<h1 class="page__title">Company</h1>
		<div class="w-full flex flex-col items-center justify-center z-10 page__inner">
			<div v-for="(user, index) in org.users" :key="index" class="">{{ user }}</div>
		</div>
	</div>
</template>
<style></style>
