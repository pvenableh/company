<script setup lang="ts">
const router = useRouter();

interface AppItem {
	name: string;
	icon: string;
	route: string;
	color: string;
	description: string;
	badge?: number;
}

const props = defineProps<{
	badges?: Record<string, number>;
}>();

const apps: AppItem[] = [
	{
		name: 'Tasks',
		icon: 'i-heroicons-clipboard-document-check',
		route: '/tasks',
		color: 'bg-blue-500',
		description: 'Manage your tasks',
	},
	{
		name: 'Projects',
		icon: 'i-heroicons-square-3-stack-3d',
		route: '/projects',
		color: 'bg-purple-500',
		description: 'Track projects',
	},
	{
		name: 'Messages',
		icon: 'i-heroicons-chat-bubble-left-right',
		route: '/channels',
		color: 'bg-cyan-500',
		description: 'Team messaging',
	},
	{
		name: 'Email',
		icon: 'i-heroicons-envelope',
		route: '/email',
		color: 'bg-rose-500',
		description: 'Campaigns & lists',
	},
	{
		name: 'Contacts',
		icon: 'i-heroicons-user-group',
		route: '/contacts',
		color: 'bg-orange-500',
		description: 'Manage contacts',
	},
	{
		name: 'Social',
		icon: 'i-heroicons-share',
		route: '/social/dashboard',
		color: 'bg-pink-500',
		description: 'Social media',
	},
	{
		name: 'Scheduler',
		icon: 'i-heroicons-calendar-date-range',
		route: '/scheduler',
		color: 'bg-amber-500',
		description: 'Book meetings',
	},
	{
		name: 'Invoices',
		icon: 'i-heroicons-document-text',
		route: '/invoices',
		color: 'bg-emerald-500',
		description: 'Billing & payments',
	},
	{
		name: 'Tickets',
		icon: 'i-heroicons-queue-list',
		route: '/tickets',
		color: 'bg-indigo-500',
		description: 'Support tickets',
	},
	{
		name: 'CardDesk',
		icon: 'i-heroicons-identification',
		route: '/carddesk',
		color: 'bg-gradient-to-br from-orange-400 to-red-500',
		description: 'Networking CRM',
	},
	{
		name: 'Financials',
		icon: 'i-heroicons-chart-bar',
		route: '/command-center/financials',
		color: 'bg-green-600',
		description: 'Financial reports',
	},
	{
		name: 'Phone',
		icon: 'i-heroicons-phone',
		route: '/phone-settings',
		color: 'bg-teal-500',
		description: 'Phone system',
	},
];

const navigateTo = (route: string) => {
	router.push(route);
};
</script>

<template>
	<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
		<button
			v-for="app in apps"
			:key="app.name"
			class="group flex flex-col items-center gap-2.5 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-all duration-200 cursor-pointer"
			@click="navigateTo(app.route)"
		>
			<div class="relative">
				<div
					:class="[app.color]"
					class="w-13 h-13 rounded-[16px] flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:scale-[1.06] transition-all duration-200"
				>
					<UIcon :name="app.icon" class="w-6 h-6 text-white" />
				</div>
				<span
					v-if="badges?.[app.name.toLowerCase()]"
					class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ring-2 ring-white dark:ring-gray-800"
				>
					{{ badges[app.name.toLowerCase()] > 9 ? '9+' : badges[app.name.toLowerCase()] }}
				</span>
			</div>
			<div class="text-center">
				<span class="text-xs font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
					{{ app.name }}
				</span>
				<p class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 hidden sm:block">{{ app.description }}</p>
			</div>
		</button>
	</div>
</template>
