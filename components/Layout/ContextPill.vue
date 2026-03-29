<script setup>
import { ChevronDown } from 'lucide-vue-next'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'

const { user } = useDirectusAuth();
const { selectedOrg, currentOrg } = useOrganization();
const { selectedTeam, teams } = useTeams();

const showOrgSwitcher = ref(false);

const orgName = computed(() => currentOrg.value?.name || 'Organization');
const currentTeamObj = computed(() => {
	if (!selectedTeam.value) return null;
	return teams.value?.find((t) => t.id === selectedTeam.value) || null;
});
const teamName = computed(() => currentTeamObj.value?.name || null);
const displayName = computed(() => {
	if (teamName.value) return `${orgName.value} · ${teamName.value}`;
	return orgName.value;
});
</script>

<template>
	<div v-if="user" class="flex items-center">
		<Popover>
			<PopoverTrigger as-child>
				<button
					class="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/60 hover:border-primary/30 hover:bg-muted/30 transition-all duration-200 text-[10px] font-medium text-muted-foreground max-w-[180px]"
				>
					<span class="truncate">{{ displayName }}</span>
					<ChevronDown class="size-3 shrink-0 opacity-50" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" class="w-64 p-2 space-y-2">
				<div class="space-y-1">
					<p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 pt-1">Organization</p>
					<LayoutClientSelect :user="user" @open-org-switcher="showOrgSwitcher = true" />
				</div>
				<div class="border-t border-border/50 pt-2 space-y-1">
					<p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2">Team</p>
					<LayoutTeamSelect />
				</div>
			</PopoverContent>
		</Popover>

		<LayoutOrgSwitcher v-model="showOrgSwitcher" />
	</div>
</template>
