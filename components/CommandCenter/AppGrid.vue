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
		name: 'Tickets',
		icon: 'i-heroicons-queue-list',
		route: '/tickets',
		color: 'bg-indigo-500',
		description: 'Support tickets',
	},
	{
		name: 'Invoices',
		icon: 'i-heroicons-document-text',
		route: '/invoices',
		color: 'bg-emerald-500',
		description: 'Billing & payments',
	},
	{
		name: 'Scheduler',
		icon: 'i-heroicons-calendar-date-range',
		route: '/scheduler',
		color: 'bg-amber-500',
		description: 'Book meetings',
	},
	{
		name: 'Channels',
		icon: 'i-heroicons-chat-bubble-left-right',
		route: '/channels',
		color: 'bg-cyan-500',
		description: 'Team messaging',
	},
	{
		name: 'Social',
		icon: 'i-heroicons-share',
		route: '/social/dashboard',
		color: 'bg-pink-500',
		description: 'Social media',
	},
	{
		name: 'Contacts',
		icon: 'i-heroicons-building-office-2',
		route: '/social/clients',
		color: 'bg-orange-500',
		description: 'Manage contacts',
	},
	{
		name: 'Financials',
		icon: 'i-heroicons-chart-bar',
		route: '/command-center/financials',
		color: 'bg-green-600',
		description: 'Financial analysis',
	},
	{
		name: 'Chat',
		icon: 'i-heroicons-chat-bubble-bottom-center-text',
		route: '/command-center/chat',
		color: 'bg-violet-500',
		description: 'Team chat',
	},
	{
		name: 'Phone',
		icon: 'i-heroicons-phone',
		route: '/phone-settings',
		color: 'bg-teal-500',
		description: 'Phone system',
	},
	{
		name: 'CardDesk',
		icon: 'i-heroicons-identification',
		route: '/carddesk',
		color: 'bg-gradient-to-br from-orange-400 to-red-500',
		description: 'Networking CRM',
	},
	{
		name: 'Tools',
		icon: 'i-heroicons-wrench-screwdriver',
		route: '/tools',
		color: 'bg-gray-500',
		description: 'Utilities',
	},
];

const navigateTo = (route: string) => {
	router.push(route);
};
</script>

<template>
	<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
		<button
			v-for="app in apps"
			:key="app.name"
			class="group flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all duration-200 cursor-pointer"
			@click="navigateTo(app.route)"
		>
			<div class="relative">
				<div
					:class="[app.color]"
					class="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all duration-200"
				>
					<UIcon :name="app.icon" class="w-7 h-7 text-white" />
				</div>
				<span
					v-if="badges?.[app.name.toLowerCase()]"
					class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center"
				>
					{{ badges[app.name.toLowerCase()] > 9 ? '9+' : badges[app.name.toLowerCase()] }}
				</span>
			</div>
			<span class="text-xs font-medium text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
				{{ app.name }}
			</span>
		</button>
	</div>
</template>
