<template>
	<div class="w-full relative">
		<!-- Card Preview -->
		<div class="w-full cursor-pointer transition-transform duration-300">
			<TicketsCard :element="element" @edit="openModal" @archive="archiveTicket" />
		</div>

		<!-- Quick Edit Modal -->
		<TicketsFormModal
			v-model="showModal"
			:ticket="element"
			:organization-id="element?.organization?.id || element?.organization"
			@updated="handleUpdated"
			@deleted="handleDeleted"
		/>
	</div>
</template>

<script setup>
const ticketItems = useDirectusItems('tickets');
const toast = useToast();
const { triggerRefresh } = useTicketsStore();

const props = defineProps({
	element: {
		type: Object,
		required: true,
	},
	columns: {
		type: Array,
		required: true,
	},
	updatingTickets: {
		type: Set,
		required: true,
	},
});

const showModal = ref(false);

const openModal = () => {
	showModal.value = true;
};

const handleUpdated = () => {
	triggerRefresh();
};

const handleDeleted = () => {
	triggerRefresh();
};

const archiveTicket = async (id) => {
	try {
		await ticketItems.update(id, { status: 'Archived', date_updated: new Date() });
		toast.add({ title: 'Ticket archived', color: 'green' });
		triggerRefresh();
	} catch (err) {
		console.error('Failed to archive ticket:', err);
		toast.add({ title: 'Failed to archive ticket', color: 'red' });
	}
};
</script>
