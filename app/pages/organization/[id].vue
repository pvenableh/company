<script setup>
const organizationItems = useDirectusItems('organization');
const { params } = useRoute();
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});

const { selectedOrg, hasMultipleOrgs, organizationOptions, setOrganization, clearOrganization, getOrganizationFilter } =
	useOrganization();

definePageMeta({
	middleware: ['auth'],
	layout: 'default',
});
useHead({ title: 'Organization Details | Earnest' });

const org = await organizationItems.get(params.id, {
	fields: [
		'*,users.directus_users_id.id,users.directus_users_id.first_name,users.directus_users_id.last_name,users.directus_users_id.avatar,users.directus_users_id.email',
	],
});
</script>
<template>
	<LayoutPageContainer>
		<div class="w-full flex flex-col items-center justify-center">
			<div v-for="(user, index) in org.users" :key="index">{{ user }}</div>
		</div>
	</LayoutPageContainer>
</template>
<style></style>
