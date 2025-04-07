<script setup>
definePageMeta({
	middleware: ['auth'],
});

const router = useRouter();
const { data: authData, status } = useAuth();
const user = computed(() => {
	return status.value === 'authenticated' ? authData?.value?.user ?? null : null;
});
const { readItems } = useDirectusItems();

const columns = [
	{
		key: 'category',
		label: 'Category',
		sortable: true,
	},
	{
		key: 'title',
		label: 'Title',
		sortable: true,
	},
	{
		key: 'organization.name',
		label: 'Organization',
		sortable: true,
	},
	{
		key: 'tasks.length',
		label: 'Tasks',
	},
	{
		key: 'services',
		label: 'Services',
	},
	{
		key: 'people',
		label: 'Assigned To',
	},
	{
		key: 'due_date',
		label: 'Due Date',
	},
	{
		key: 'actions',
	},
];

const items = (row) => [
	[
		{
			label: 'Edit',
			icon: 'i-heroicons-pencil-square-20-solid',
			click: () => router.push('/tickets/' + row.id),
		},
		{
			label: 'Archive',
			icon: 'i-heroicons-archive-box-20-solid',
		},
	],
	[
		{
			label: 'Delete',
			icon: 'i-heroicons-trash-20-solid',
		},
	],
];

const tickets = await readItems('tickets', {
	fields: [
		'*,services.services_id.id,services.services_id.name,tasks,assigned_to.directus_users_id.first_name,assigned_to.directus_users_id.last_name,assigned_to.directus_users_id.id,assigned_to.directus_users_id.avatar,organization.name',
	],
});

const flattenTickets = tickets.map((item) => {
	let flatItem = { ...item };

	// Flatten organization
	if (item.organization) {
		flatItem.organization_name = item.organization.name;
	} else {
		flatItem.organization_name = null;
	}

	// Flatten assigned_to
	if (item.assigned_to.length > 0) {
		flatItem.people = item.assigned_to.map(
			(person) => person.directus_users_id.first_name + ' ' + person.directus_users_id.last_name,
		);
		// flatItem.assigned_to = item.assigned_to.map((assign) => {
		// 	return {
		// 		name: assign.directus_users_id.first_name + ' ' + assign.directus_users_id.last_name,
		// 		id: assign.directus_users_id.id,
		// 		avatar: assign.directus_users_id.avatar,
		// 	};
		// });
	} else {
		flatItem.people = [];
	}

	// Flatten services
	if (item.services.length > 0) {
		flatItem.services = item.services.map((service) => service.services_id.name);
	} else {
		flatItem.services = [];
	}

	return flatItem;
});

const selected = ref([flattenTickets[1]]);
const q = ref('');

const filteredTickets = computed(() => {
	if (!q.value) {
		return flattenTickets;
	}

	return flattenTickets.filter((ticket) => {
		return Object.values(ticket).some((value) => {
			return String(value).toLowerCase().includes(q.value.toLowerCase());
		});
	});
});
</script>
<template>
	<div class="w-full tickets">
		<div class="flex px-3 py-3.5 border-b border-gray-200 dark:border-gray-700">
			<UInput v-model="q" placeholder="Filter tickets..." />
		</div>
		<UTable :columns="columns" :rows="filteredTickets">
			<template #services-data="{ row }">
				<span v-if="row.services">
					<UBadge
						v-for="(service, index) in row.services"
						:key="index"
						size="xs"
						variant="outline"
						:ui="{ rounded: 'rounded-full' }"
						class="uppercase font-bold text-[10px] px-3 mr-1 last:mr-0"
					>
						{{ service }}
					</UBadge>
				</span>
			</template>
			<template #people-data="{ row }">
				<span v-if="row.people">
					<UBadge
						v-for="(person, index) in row.people"
						:key="index"
						size="sm"
						variant="outline"
						:ui="{ rounded: 'rounded-full' }"
						class="uppercase font-bold text-[10px] px-3 mr-1 last:mr-0"
						:class="person === user.first_name + ' ' + user.last_name ? 'bg-sky-400 text-white' : ''"
					>
						{{ person === user.first_name + ' ' + user.last_name ? 'You' : person }}
					</UBadge>

					<!-- <UAvatarGroup size="xs">
						<UTooltip
							v-for="(person, index) in row.assigned_to"
							:key="index"
							:text="person.id === user.id ? 'You' : person.first_name + ' ' + person.last_name"
						>
							<UAvatar :src="userAvatar(person)" size="xs" :alt="person.first_name + ' ' + person.last_name" />
						</UTooltip>
					</UAvatarGroup> -->
				</span>
			</template>
			<template #actions-data="{ row }">
				<UDropdown :items="items(row)">
					<UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
				</UDropdown>
			</template>
		</UTable>
	</div>
</template>
<style lang="postcss">
.tickets {
	th {
		font-size: 10px !important;
		@apply uppercase font-bold tracking-wide;
		button {
			font-size: 10px !important;
		}
	}
}
</style>
