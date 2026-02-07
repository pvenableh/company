<script setup>
definePageMeta({
	middleware: ['auth'],
});
const ticketItems = useDirectusItems('tickets');
const serviceItems = useDirectusItems('services');
const organizationItems = useDirectusItems('organizations');

const tickets = await ticketItems.list({
	fields: [
		'*,organization.id,organization.name,services.services_id.name,services.services_id.color,services.services_id.id',
	],
});

const services = await serviceItems.list({
	fields: ['id', 'name', 'color'],
	filter: {
		status: 'published',
	},
});

services.push({
	id: '',
	name: 'Show All',
	color: '#cccccc',
});

const organizations = await organizationItems.list({
	fields: ['id', 'name'],
	filter: {
		status: 'published',
	},
});

organizations.push({
	id: '',
	name: 'Show All',
	color: '#cccccc',
});

const service = ref({
	id: '',
	name: '',
	color: '',
});

const organization = ref({
	id: '',
	name: '',
});

const filteredTickets = ref(tickets);

const organizationChange = (organization) => {
	if (organization.id) {
		filteredTickets.value = tickets.filter((ticket) => {
			if (ticket.organization) {
				return ticket.organization.id === organization.id;
			}
		});
	} else {
		filteredTickets.value = tickets;
	}
};
</script>
<template>
	<div class="relative w-full min-h-screen flex items-center justify-start flex-col">
		<div class="w-full flex flex-row items-start max-w-xl">
			<div class="w-64 uppercase relative">
				<USelectMenu v-model="service" :options="services" class="p-0">
					<template #label>
						<span v-if="service.name" class="uppercase tracking-wide">{{ service.name }}</span>
						<span v-else class="uppercase tracking-wide">Select Service</span>
						<span v-if="service.color" class="h-2 w-2 rounded-full" :style="`background: ${service.color}`" />
						<span v-else class="h-2 w-2 rounded-full" :style="`background: #CCCCCC`" />
					</template>
					<template #option="{ option: serviceItem }">
						<span class="uppercase tracking-wide">{{ serviceItem.name }}</span>
						<span class="h-2 w-2 rounded-full" :style="`background: ${serviceItem.color}`" />
					</template>
				</USelectMenu>
			</div>
			<div class="mx-2 w-64 uppercase relative">
				<USelectMenu
					v-model="organization"
					:options="organizations"
					class="p-0"
					@update:model-value="organizationChange"
				>
					<template #label>
						<span v-if="organization.name" class="uppercase tracking-wide">{{ organization.name }}</span>
						<span v-else class="uppercase tracking-wide">Select Client</span>
					</template>
					<template #option="{ option: organizationItem }">
						<span class="uppercase tracking-wide">{{ organizationItem.name }}</span>
					</template>
				</USelectMenu>
			</div>
		</div>
		<div class="w-full grid gap-2 grid-cols-3">
			<div v-for="(ticket, index) in filteredTickets" :key="index">
				<UCard>
					<template #header>
						<Placeholder class="h-8" />
					</template>

					{{ ticket.title }}

					<template #footer>
						<Placeholder class="h-8" />
					</template>
				</UCard>
			</div>
		</div>
	</div>
</template>

<style></style>
