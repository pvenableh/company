<template>
	<div class="flex items-center gap-4 mb-6">
		<UPopover>
			<UButton variant="outline" size="sm" class="flex items-center gap-2">
				{{ selectedOrg?.name || 'All Organizations' }}
				<UIcon name="i-heroicons-chevron-down" class="h-4 w-4" />
			</UButton>

			<template #content>
				<div class="p-2 w-56">
					<USelect
						v-model="selectedOrg"
						:options="organizations"
						placeholder="Select Organization"
						@update:modelValue="updateOrg"
					/>
				</div>
			</template>
		</UPopover>

		<UButton
			:color="showMyTickets ? 'primary' : 'gray'"
			variant="soft"
			size="sm"
			class="flex items-center gap-2"
			@click="toggleMyTickets"
		>
			<UIcon name="i-heroicons-user" class="h-4 w-4" />
			My Tickets
		</UButton>
	</div>
</template>

<script setup>
const emit = defineEmits(['update:organization', 'update:my-tickets']);
const selectedOrg = ref(null);
const showMyTickets = ref(false);

const organizationItems = useDirectusItems('organizations');
// const organizations = ref([]);

// onMounted(async () => {
// 	const { data } = await organizationItems.list({
// 		fields: ['id', 'name'],
// 	});
// 	organizations.value = data;
// });

const organizations = await organizationItems.list({
	fields: ['id,name'],
});

function toggleMyTickets() {
	showMyTickets.value = !showMyTickets.value;
	emit('update:my-tickets', showMyTickets.value);
}

function updateOrg(org) {
	selectedOrg.value = org;
	emit('update:organization', org);
}
</script>
