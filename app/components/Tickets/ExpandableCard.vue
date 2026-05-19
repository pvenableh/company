<template>
	<div class="w-full relative">
		<!-- Card Preview -->
		<div class="w-full cursor-pointer transition-transform duration-300">
			<TicketsCard :element="element" @edit="handleEdit" @archive="archiveTicket" />
		</div>

		<!-- Quick Edit Modal — agency only. Portal users can't edit, so we
			 emit `view` instead and let the parent open a read-only flow. -->
		<TicketsFormModal
			v-if="!portal"
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
const { isAppsMode } = useAppsMode();
const ticketSlide = useAppSlideOver('ticket');

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
	/** When true, the agency edit/archive modal is hidden and the parent
	 * receives a `view` event so it can open a read-only slide-over. */
	portal: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['view']);

const showModal = ref(false);

const openModal = () => {
	showModal.value = true;
};

const handleEdit = (ticket) => {
	if (props.portal) {
		emit('view', ticket);
		return;
	}
	// Apps mode → push the quick-look slide-over so the board stays behind
	// (iOS push/pop feel). Classic mode keeps the inline edit modal.
	if (isAppsMode.value && ticket?.id) {
		ticketSlide.open(String(ticket.id));
		return;
	}
	openModal();
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
