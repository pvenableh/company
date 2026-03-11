<script setup>
definePageMeta({
	middleware: ['auth'],
});

const { user } = useDirectusAuth();

function greetUser() {
	const hour = new Date().getHours();
	if (hour < 12) return 'Good morning';
	if (hour < 18) return 'Good afternoon';
	return 'Good evening';
}
</script>

<template>
	<div class="md:px-6 mx-auto flex items-start justify-center flex-col relative px-4 pt-20">
		<h1 class="page__title">Statistics</h1>
		<div class="w-full flex flex-col items-center min-h-svh z-10 !mt-0 justify-start page__inner">
			<div class="w-full max-w-[1200px]">
				<h2 class="text-lg uppercase tracking-wide mb-2 font-thin">{{ greetUser() }} {{ user?.first_name }}.</h2>
				<div>
					<h5
						class="w-full mb-2 uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-wider text-[10px]"
					>
						Ticket Activity:
					</h5>
					<TicketsDashboard />
				</div>
			</div>
		</div>
	</div>
</template>
