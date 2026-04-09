<template>
	<UCard>
		<template #header>
			<div class="flex justify-between items-center">
				<h2 class="font-bold uppercase tracking-wide text-sm">Recently Completed</h2>
				<UButton size="xs" variant="ghost" @click="$emit('viewTicket', tickets[0]?.id)" v-if="tickets.length">
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
							<UBadge size="xs" class="uppercase bg-[var(--green)]">Completed</UBadge>
							<UBadge size="xs" color="gray">{{ ticket.priority }}</UBadge>
						</div>
					</div>
					<div class="text-right">
						<p class="text-xs text-muted-foreground">Completed: {{ formatDate(ticket.date_updated) }}</p>
						<p class="text-xs text-[var(--green)]">
							Time to complete: {{ formatDuration(getTicketTimeToComplete(ticket)) }}
						</p>
					</div>
				</div>
				<div class="flex justify-between mt-2">
					<div class="flex items-center gap-1 text-xs text-muted-foreground">
						<UIcon name="i-heroicons-user-circle" class="w-3 h-3" />
						<span>{{ formatAssignees(ticket.assigned_to) }}</span>
					</div>
					<UButton size="xs" variant="link" @click="$emit('viewTicket', ticket.id)">View</UButton>
				</div>
			</div>
			<div v-if="!tickets.length" class="py-4 text-center text-muted-foreground">No recently completed tickets found</div>
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
const getTicketTimeToComplete = (ticket) => {
	if (ticket.status !== 'Completed' || !ticket.date_updated) return 0;

	const createdDate = new Date(ticket.date_created);
	const completedDate = new Date(ticket.date_updated);
	return differenceInHours(completedDate, createdDate);
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
