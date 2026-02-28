<template>
	<div class="container mx-auto py-12">
		<h1 class="text-3xl font-bold mb-8">Admin Tools</h1>

		<div v-if="isAdmin">
			<ToolsCommentsMigrationTool />
		</div>
		<div v-else>
			<UAlert title="Access Denied" description="You don't have permission to access this page." color="red" />
		</div>
	</div>
</template>

<script setup>
import { computed } from 'vue';

const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const { isAdmin: checkIsAdmin } = useRole();

const isAdmin = computed(() => {
	return checkIsAdmin(user.value);
});
</script>
