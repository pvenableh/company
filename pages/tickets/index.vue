<script setup>
const { readItems } = useDirectusItems();

const tickets = await readItems('tickets', {
	fields: ['*.*.*'],
});
</script>
<template>
	<TicketsTicketCard v-for="ticket in tickets" :key="ticket.id" :ticket="ticket" class="max-w-64" />
</template>
