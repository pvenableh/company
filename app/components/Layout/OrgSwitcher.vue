<script setup>
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Building2, Plus, Check, Settings } from 'lucide-vue-next'

const props = defineProps({
	modelValue: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['update:modelValue']);

const { selectedOrg, organizations, setOrganization, hasMultipleOrgs } = useOrganization();
const { clearClient } = useClients();
const config = useRuntimeConfig();

const isOpen = computed({
	get: () => props.modelValue,
	set: (val) => emit('update:modelValue', val),
});

const getIconUrl = (org) => {
	if (!org?.icon) return undefined;
	return `${config.public.directusUrl}/assets/${org.icon}?key=avatar`;
};

const getInitials = (org) => {
	if (!org?.name) return '';
	return org.name
		.split(' ')
		.map((word) => word[0])
		.join('')
		.toUpperCase()
		.substring(0, 2);
};

const handleSelectOrg = (orgId) => {
	if (orgId !== selectedOrg.value) {
		setOrganization(orgId);
		clearClient();
	}
	isOpen.value = false;
};

const handleRegisterOrg = () => {
	isOpen.value = false;
	navigateTo('/organization/new');
};
</script>

<template>
	<UModal v-model="isOpen" :ui="{ width: 'max-w-md' }">
		<div class="p-6">
			<div class="flex items-center gap-3 mb-6">
				<div class="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
					<Building2 class="size-5 text-gray-500" />
				</div>
				<div>
					<h2 class="text-lg font-semibold text-gray-900">Switch Organization</h2>
					<p class="text-sm text-gray-500">Select which organization to work in</p>
				</div>
			</div>

			<!-- Organization list -->
			<div class="space-y-2 mb-6 max-h-[60vh] overflow-y-auto">
				<div
					v-for="org in organizations"
					:key="org.id"
					role="button"
					tabindex="0"
					class="w-full flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer"
					:class="
						selectedOrg === org.id
							? 'border-[var(--cyan)] bg-cyan-50/50'
							: 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
					"
					@click="handleSelectOrg(org.id)"
					@keydown.enter.prevent="handleSelectOrg(org.id)"
					@keydown.space.prevent="handleSelectOrg(org.id)"
				>
					<Avatar class="size-10">
						<AvatarImage v-if="getIconUrl(org)" :src="getIconUrl(org)" :alt="org.name" />
						<AvatarFallback class="text-sm font-medium">
							{{ getInitials(org) }}
						</AvatarFallback>
					</Avatar>

					<div class="flex-1 text-left min-w-0">
						<p class="text-sm font-medium text-gray-900 truncate">{{ org.name }}</p>
						<div class="flex items-center gap-3 mt-0.5">
							<span v-if="org.ticketsCount > 0" class="text-[10px] text-gray-400">
								{{ org.ticketsCount }} ticket{{ org.ticketsCount !== 1 ? 's' : '' }}
							</span>
							<span v-if="org.projectsCount > 0" class="text-[10px] text-gray-400">
								{{ org.projectsCount }} project{{ org.projectsCount !== 1 ? 's' : '' }}
							</span>
							<span v-if="org.plan" class="text-[10px] text-[var(--cyan)] uppercase">
								{{ org.plan }}
							</span>
						</div>
					</div>

					<NuxtLink
						:to="`/organization`"
						class="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
						title="Organization settings"
						@click.stop="isOpen = false; setOrganization(org.id)"
					>
						<Settings class="size-4 text-gray-400 hover:text-gray-600" />
					</NuxtLink>
					<Check
						v-if="selectedOrg === org.id"
						class="size-5 text-[var(--cyan)] shrink-0"
					/>
				</div>
			</div>

			<!-- Register new organization -->
			<div class="border-t border-gray-200 pt-4">
				<button
					class="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-gray-300 hover:border-[var(--cyan)] hover:bg-cyan-50/30 transition-all group"
					@click="handleRegisterOrg"
				>
					<div class="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-cyan-100 flex items-center justify-center transition-colors">
						<Plus class="size-5 text-gray-400 group-hover:text-[var(--cyan)] transition-colors" />
					</div>
					<div class="text-left">
						<p class="text-sm font-medium text-gray-700 group-hover:text-gray-900">Register New Organization</p>
						<p class="text-xs text-gray-400">Requires a new subscription</p>
					</div>
				</button>
			</div>
		</div>
	</UModal>
</template>
