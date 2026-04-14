<template>
	<div>
		<div class="flex items-center justify-between mb-2">
			<span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ label }}</span>
			<button
				v-if="canAssign"
				type="button"
				class="text-[10px] text-primary hover:underline"
				@click="showPicker = !showPicker"
			>
				{{ showPicker ? 'Done' : '+ Assign' }}
			</button>
		</div>

		<!-- Current members -->
		<div v-if="members.length" class="space-y-1">
			<div
				v-for="u in members"
				:key="u.id"
				class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/20 group"
			>
				<div class="size-6 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
					<img
						v-if="getAvatarUrl(u)"
						:src="getAvatarUrl(u)"
						:alt="u.first_name"
						class="size-6 object-cover rounded-full"
					/>
					<span v-else class="text-[8px] font-semibold text-muted-foreground">{{ getInitials(u) }}</span>
				</div>
				<div class="flex-1 min-w-0">
					<span class="text-xs block truncate">{{ u.first_name }} {{ u.last_name }}</span>
					<span v-if="u.email" class="text-[10px] text-muted-foreground/60 block truncate">{{ u.email }}</span>
				</div>
				<button
					type="button"
					class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
					@click="removeMember(u.id)"
				>
					<Icon name="lucide:x" class="w-3.5 h-3.5" />
				</button>
			</div>
		</div>
		<div v-else-if="!showPicker" class="text-xs text-muted-foreground/60 py-2 text-center">
			{{ emptyText }}
		</div>

		<!-- User picker -->
		<div v-if="showPicker && canAssign" class="mt-2 space-y-1.5">
			<input
				v-model="searchQuery"
				type="text"
				placeholder="Search users..."
				class="w-full h-7 rounded-lg border border-border bg-background px-2.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
			/>
			<div class="max-h-36 overflow-y-auto space-y-0.5">
				<button
					v-for="u in filteredAvailable"
					:key="u.id"
					type="button"
					class="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted/30 transition-colors text-xs"
					@click="addMember(u)"
				>
					<div class="size-5 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
						<img
							v-if="getAvatarUrl(u)"
							:src="getAvatarUrl(u)"
							:alt="u.first_name"
							class="size-5 object-cover rounded-full"
						/>
						<span v-else class="text-[7px] font-semibold text-muted-foreground">{{ getInitials(u) }}</span>
					</div>
					<span>{{ u.first_name }} {{ u.last_name }}</span>
				</button>
				<div v-if="!filteredAvailable.length" class="text-[10px] text-muted-foreground text-center py-2">
					{{ searchQuery ? 'No matching users' : 'No users available' }}
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
const props = defineProps({
	/** Array of user objects currently assigned */
	modelValue: {
		type: Array,
		default: () => [],
	},
	/** All available users to pick from */
	users: {
		type: Array,
		default: () => [],
	},
	/** Section label */
	label: {
		type: String,
		default: 'Assigned To',
	},
	/** Empty state text */
	emptyText: {
		type: String,
		default: 'No one assigned',
	},
	/** Allow multiple assignments (false = single person) */
	multiple: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['update:modelValue', 'added', 'removed']);

const config = useRuntimeConfig();
const showPicker = ref(false);
const searchQuery = ref('');

// Current assigned members as user objects
const members = computed(() => {
	return props.modelValue
		.map(id => {
			if (typeof id === 'object') return id;
			return props.users.find(u => u.id === id);
		})
		.filter(Boolean);
});

// Can we assign more people?
const canAssign = computed(() => {
	if (props.multiple) return true;
	return members.value.length === 0;
});

// Available users filtered by search and not already assigned
const filteredAvailable = computed(() => {
	const assignedIds = new Set(props.modelValue.map(v => typeof v === 'object' ? v.id : v));
	let available = props.users.filter(u => !assignedIds.has(u.id));
	if (searchQuery.value) {
		const q = searchQuery.value.toLowerCase();
		available = available.filter(u => {
			const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
			return name.includes(q) || u.email?.toLowerCase().includes(q);
		});
	}
	return available;
});

function addMember(user) {
	if (props.multiple) {
		emit('update:modelValue', [...props.modelValue, user.id]);
	} else {
		// Single assignment — replace
		emit('update:modelValue', [user.id]);
		showPicker.value = false;
	}
	emit('added', user.id);
	searchQuery.value = '';
}

function removeMember(userId) {
	emit('update:modelValue', props.modelValue.filter(id => (typeof id === 'object' ? id.id : id) !== userId));
	emit('removed', userId);
}

function getAvatarUrl(user) {
	if (!user?.avatar) return null;
	const avatarId = typeof user.avatar === 'object' ? user.avatar.id : user.avatar;
	if (!avatarId) return null;
	return `${config.public.directusUrl}/assets/${avatarId}?key=small`;
}

function getInitials(user) {
	const first = user?.first_name?.[0] || '';
	const last = user?.last_name?.[0] || '';
	return (first + last).toUpperCase() || '?';
}
</script>
