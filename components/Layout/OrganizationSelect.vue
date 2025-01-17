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

const props = defineProps({
	containerClass: {
		type: String,
		default: 'w-full lg:w-64 relative',
	},
});
</script>

<template>
	<div v-if="hasMultipleOrgs" :class="containerClass">
		{{ selectedOrg }}
		<span class="block text-red-500">{{ localSelectedOrg }}</span>
		<USelectMenu
			v-model="localSelectedOrg"
			:options="organizationOptions"
			option-attribute="name"
			value-attribute="id"
			placeholder="Select Organization"
			class="uppercase text-xs text-gray-400"
			@change="handleSelectChange"
			searchable
		>
			<!-- Label Template -->
			<template #label="{ option }">
				<div class="flex items-center gap-2">
					<img
						v-if="option?.logo"
						:src="`${config.public.directusUrl}/assets/${option.logo}?key=small`"
						class="w-6 h-6 object-contain rounded-full"
						:alt="option?.name"
					/>
					<span class="truncate">{{ option?.name || 'Select Organization' }}</span>
				</div>
			</template>

			<!-- Option Template -->
			<template #option="{ option }">
				<div class="flex items-center gap-2 py-1">
					{{ option }}
					<img
						v-if="option.logo"
						:src="`${config.public.directusUrl}/assets/${option.logo}?key=small`"
						class="w-6 h-6 object-contain rounded-full"
						:alt="option.name"
					/>
					<div class="flex flex-col">
						<span class="font-medium">{{ option.name }}</span>
					</div>
				</div>
			</template>
		</USelectMenu>
	</div>
</template>
