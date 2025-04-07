<script setup>
definePageMeta({
	middleware: ['auth'],
});

const { data: authData, status } = useAuth();
const user = computed(() => {
	return status.value === 'authenticated' ? authData?.value?.user ?? null : null;
});
const { readItems } = useDirectusItems();
const config = useRuntimeConfig();

const admin = config.public.adminRole;

const payments = await readItems('payments_received', {
	fields: ['*,invoice_id.*'],
	sort: 'date_received',
});
</script>
<template>
	<div>
		<h1 class="page__title">Payments</h1>
		<div class="w-full flex flex-col items-center justify-center z-10 page__inner">
			<div class="w-full max-w-xl" v-if="user.role === admin">
				<h2 class="text-xl mb-2 font-thin">Payments</h2>
				<div class="grid gap-6 grid-cols-1 sm:grid-cols-2">
					{{ payments }}
				</div>
			</div>
		</div>
	</div>
</template>
