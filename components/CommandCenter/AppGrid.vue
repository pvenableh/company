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
		name: 'Files',
		icon: 'i-heroicons-folder-open',
		route: '/files',
		color: 'bg-sky-500',
		description: 'File manager',
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
		route: '/financials',
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
	{
		name: 'Time Tracker',
		icon: 'i-heroicons-clock',
		route: '/time-tracker',
		color: 'bg-lime-600',
		description: 'Track your time',
	},
	{
		name: 'AI Chat',
		icon: 'i-heroicons-sparkles',
		route: '/command-center/ai',
		color: 'bg-gradient-to-br from-violet-500 to-purple-600',
		description: 'AI assistant',
	},
	{
		name: 'Guide',
		icon: 'i-heroicons-book-open',
		route: '/guide',
		color: 'bg-gradient-to-br from-cyan-500 to-blue-500',
		description: 'Setup tutorial',
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
			class="group flex flex-col items-center gap-2.5 p-3 rounded-2xl hover:bg-muted/40 transition-all duration-200 cursor-pointer ios-press"
			@click="navigateTo(app.route)"
		>
			<div class="relative">
				<div
					:class="[app.color]"
					class="w-13 h-13 rounded-[16px] flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:scale-[1.04] transition-all duration-200"
				>
					<UIcon :name="app.icon" class="w-6 h-6 text-white" />
				</div>
				<span
					v-if="badges?.[app.name.toLowerCase()]"
					class="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ring-2 ring-background"
				>
					{{ badges[app.name.toLowerCase()] > 9 ? '9+' : badges[app.name.toLowerCase()] }}
				</span>
			</div>
			<div class="text-center">
				<span class="text-xs font-medium text-foreground/80 group-hover:text-foreground transition-colors">
					{{ app.name }}
				</span>
				<p class="text-[10px] text-muted-foreground mt-0.5 hidden sm:block">{{ app.description }}</p>
			</div>
		</button>
	</div>
</template>
