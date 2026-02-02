<template>
	<div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg mb-6">
		<h3 class="text-lg font-medium mb-2">Permissions Debug</h3>

		<div class="space-y-2 text-sm">
			<div>
				<span class="font-bold">User ID:</span>
				{{ currentUser?.id || 'Not loaded' }}
			</div>
			<div>
				<span class="font-bold">User Email:</span>
				{{ currentUser?.email || 'Not loaded' }}
			</div>
			<div>
				<span class="font-bold">User Role:</span>
				<pre class="bg-gray-200 dark:bg-gray-700 p-1 rounded mt-1">{{
					JSON.stringify(currentUser?.role || {}, null, 2)
				}}</pre>
			</div>
			<div>
				<span class="font-bold">Admin Role ID:</span>
				{{ ADMIN_ROLE_ID }}
			</div>
			<div>
				<span class="font-bold">Client Manager Role ID:</span>
				{{ CLIENT_MANAGER_ROLE_ID }}
			</div>
			<div>
				<span class="font-bold">Has Admin Access:</span>
				<UBadge :color="hasAdminAccess(currentUser) ? 'green' : 'red'">
					{{ hasAdminAccess(currentUser) ? 'Yes' : 'No' }}
				</UBadge>
			</div>
			<div>
				<span class="font-bold">Selected Organization:</span>
				{{ selectedOrg || 'None' }}
			</div>
			<div>
				<span class="font-bold">Teams Access Condition:</span>
				<UBadge :color="hasAdminAccess(currentUser) && selectedOrg ? 'green' : 'red'">
					{{ hasAdminAccess(currentUser) && selectedOrg ? 'Met' : 'Not Met' }}
				</UBadge>
			</div>
		</div>

		<div class="mt-4" v-if="!hasAdminAccess(currentUser)">
			<p class="text-red-500 font-medium">Admin access check is failing! Let's check why:</p>
			<div class="space-y-2 mt-2">
				<div>
					<span class="font-bold">Check 1:</span>
					User has role property: {{ !!currentUser?.role ? '✅' : '❌' }}
				</div>
				<div>
					<span class="font-bold">Check 2:</span>
					Role has ID property: {{ !!currentUser?.role ? '✅' : '❌' }}
				</div>
				<div>
					<span class="font-bold">Check 3:</span>
					Role ID matches Admin ID: {{ currentUser?.role === ADMIN_ROLE_ID ? '✅' : '❌' }}
				</div>
				<div>
					<span class="font-bold">Check 4:</span>
					Role ID matches Client Manager ID: {{ currentUser?.role === CLIENT_MANAGER_ROLE_ID ? '✅' : '❌' }}
				</div>
			</div>
		</div>

		<!-- Try alternative role structures -->
		<div class="mt-4" v-if="!hasAdminAccess(currentUser)">
			<p class="text-orange-500 font-medium">Trying alternative role structures:</p>
			<div class="space-y-2 mt-2">
				<div>
					<span class="font-bold">Role directly as string:</span>
					{{ currentUser?.role === ADMIN_ROLE_ID ? '✅' : '❌' }}
				</div>
				<div>
					<span class="font-bold">Role ID directly:</span>
					{{ currentUser?.role_id === ADMIN_ROLE_ID ? '✅' : '❌' }}
				</div>
			</div>
		</div>

		<!-- Show full user details -->
		<div class="mt-4">
			<UButton color="gray" variant="soft" size="sm" @click="showUserDetails = !showUserDetails">
				{{ showUserDetails ? 'Hide' : 'Show' }} Full User Details
			</UButton>

			<pre
				v-if="showUserDetails"
				class="bg-gray-200 dark:bg-gray-700 p-2 rounded mt-2 text-xs overflow-auto max-h-60"
				>{{ JSON.stringify(currentUser, null, 2) }}</pre
			>
		</div>
	</div>
</template>

<script setup>
import { ref } from 'vue';
import { useTeams } from '~/composables/useTeams';
import { useOrganization } from '~/composables/useOrganization';

const { hasAdminAccess, ADMIN_ROLE_ID, CLIENT_MANAGER_ROLE_ID } = useTeams();
const { selectedOrg } = useOrganization();
const { user: sessionUser, loggedIn } = useUserSession();
const currentUser = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});

const showUserDetails = ref(false);
</script>
