<template>
	<UCard>
		<template #header>
			<div class="flex justify-between items-center">
				<h2 class="font-bold uppercase tracking-wide text-sm">Oldest Open Tickets</h2>
				<UButton
					size="xs"
					variant="ghost"
					to="/tickets"
					v-if="tickets.length"
					icon="i-heroicons-arrow-right"
					:trailing="true"
				>
					View All
				</UButton>
			</div>
		</template>
		<div class="divide-y">
			<div v-for="ticket in tickets" :key="ticket.id" class="py-3">
				<div class="flex justify-between">
					<div>
						<h3 class="text-sm font-medium">{{ ticket.title }}</h3>
						<div class="flex gap-2 mt-1">
							<UBadge size="xs" :class="'uppercase bg-[' + getStatusColor(ticket.status) + ']'">
								{{ ticket.status }}
							</UBadge>
							<UBadge size="xs" color="gray">{{ ticket.priority }}</UBadge>
						</div>
					</div>
					<div class="text-right">
						<p class="text-xs text-muted-foreground">Created: {{ formatDate(ticket.date_created) }}</p>
						<p class="text-xs font-bold text-red-500">Age: {{ formatDuration(getTicketAge(ticket)) }}</p>
					</div>
				</div>
				<div class="flex justify-between mt-2">
					<div class="flex items-center gap-1 text-xs text-muted-foreground">
						<UIcon name="i-heroicons-user-circle" class="w-3 h-3" />
						<span>{{ formatAssignees(ticket.assigned_to) }}</span>
					</div>
					<UButton
						size="xs"
						variant="ghost"
						@click="$emit('viewTicket', ticket.id)"
						icon="i-heroicons-arrow-right"
						:trailing="true"
					>
						View
					</UButton>
				</div>
			</div>
			<div v-if="!tickets.length" class="py-4 text-center text-muted-foreground">No open tickets found</div>
		</div>
	</UCard>
</template>

<script setup>
import { differenceInHours } from 'date-fns';

const props = defineProps({
	tickets: {
		type: Array,
		required: true,
	},
});

defineEmits(['viewTicket']);

// Helper functions (duplicated from parent component)
const getStatusColor = (status) => {
	status = status.toLowerCase().replace(/\s+/g, '');

	switch (status) {
		case 'pending':
			return 'var(--cyan)';
		case 'scheduled':
			return 'var(--cyan2)';
		case 'inprogress':
			return 'var(--green2)';
		case 'completed':
			return 'var(--green)';
		default:
			return 'gray';
	}
};

const getTicketAge = (ticket) => {
	const createdDate = new Date(ticket.date_created);
	const now = new Date();
	return differenceInHours(now, createdDate);
};

// Uses getFriendlyDateThree from utils/dates.ts
const formatDate = (dateString) => getFriendlyDateThree(dateString);

const formatDuration = (hours) => {
	if (hours === 0) return 'N/A';

	if (hours < 24) {
		return `${Math.round(hours)}h`;
	} else {
		const days = Math.floor(hours / 24);
		const remainingHours = Math.round(hours % 24);
		return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
	}
};

const formatAssignees = (assignees) => {
	if (!assignees || assignees.length === 0) return 'Unassigned';

	if (assignees.length === 1) {
		const user = assignees[0].directus_users_id;
		if (!user) return 'Unassigned';
		return `${user.first_name} ${user.last_name}`;
	}

	return `${assignees.length} assignees`;
};
</script>
