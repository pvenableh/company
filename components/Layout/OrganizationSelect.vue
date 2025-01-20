<script setup>
const { selectedOrg, organizationOptions, hasMultipleOrgs, setOrganization } = useOrganization();
const config = useRuntimeConfig();

// Create a local ref for v-model binding
const localSelectedOrg = ref(selectedOrg.value);

watch(selectedOrg, (newVal) => {
	localSelectedOrg.value = newVal;
});

const handleSelectChange = (value) => {
	console.log('Selected organization ID:', value);
	const orgId = value === 'null' ? null : value;
	setOrganization(orgId);
};

// Computed property to get the current organization name
const currentOrgName = computed(() => {
	const selectedOption = organizationOptions.value.find((org) => org.id === selectedOrg.value);
	return selectedOption?.name || 'Select Organization';
});

const props = defineProps({
	user: {
		type: Object,
		default: null,
	},
	containerClass: {
		type: String,
		default: 'w-full lg:w-64 relative',
	},
});
</script>

<template>
	<div :class="containerClass">
		<USelectMenu
			v-if="hasMultipleOrgs"
			v-model="localSelectedOrg"
			:options="organizationOptions"
			option-attribute="name"
			value-attribute="id"
			:placeholder="currentOrgName"
			class="uppercase text-xs text-gray-400 ml-2"
			@change="handleSelectChange"
			searchable
		>
			<!-- Label Template -->
			<template #label>
				<div class="flex items-center gap-2">
					<span class="truncate">{{ currentOrgName }}</span>
				</div>
			</template>

			<!-- Option Template -->
			<template #option="{ option }">
				<div class="flex items-center gap-2 py-1">
					<div class="flex flex-col">
						<span class="text-[10px] leading-3">{{ option.name }}</span>
					</div>
				</div>
			</template>
		</USelectMenu>
		<div v-else class="ml-2 flex items-center space-x-2 text-[12px] leading-3 uppercase">
			{{ user.organizations?.[0]?.organizations_id?.name }}
		</div>
	</div>
</template>
