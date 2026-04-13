<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</span>
      <button
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
          class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
          @click="removeMember(u.id)"
        >
          <Icon name="lucide:x" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    <div v-else class="text-xs text-muted-foreground/60 py-2 text-center">
      No team members assigned
    </div>

    <!-- User picker -->
    <div v-if="showPicker" class="mt-2 space-y-1.5">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search users..."
        class="w-full h-7 rounded-lg border border-border bg-background px-2.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />
      <div class="max-h-36 overflow-y-auto space-y-0.5">
        <button
          v-for="u in availableUsers"
          :key="u.id"
          class="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted/30 transition-colors text-xs"
          @click="addMember(u.id)"
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
        <div v-if="!availableUsers.length" class="text-[10px] text-muted-foreground text-center py-2">
          {{ searchQuery ? 'No matching users' : 'All org users assigned' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  projectId: string;
}>();

const emit = defineEmits<{
  (e: 'updated'): void;
}>();

const config = useRuntimeConfig();
const junctionItems = useDirectusItems('projects_directus_users');
const { selectedOrg } = useOrganization();

const showPicker = ref(false);
const searchQuery = ref('');
const members = ref<any[]>([]);
const allOrgUsers = ref<any[]>([]);

async function fetchMembers() {
  if (!props.projectId) return;
  try {
    const junctions = await junctionItems.list({
      filter: { projects_id: { _eq: props.projectId } },
      fields: ['id', 'directus_users_id.id', 'directus_users_id.first_name', 'directus_users_id.last_name', 'directus_users_id.email', 'directus_users_id.avatar'],
      limit: -1,
    });
    members.value = junctions
      .map((j: any) => j.directus_users_id)
      .filter((u: any) => u);
  } catch (err) {
    console.error('Failed to fetch team members:', err);
    members.value = [];
  }
}

async function fetchOrgUsers() {
  if (!selectedOrg.value) return;
  try {
    const { readUsers } = useDirectusUsers();
    const data = await readUsers({
      filter: {
        organizations: {
          organizations_id: {
            id: { _eq: selectedOrg.value },
          },
        },
      },
      fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
      sort: ['first_name'],
    });
    allOrgUsers.value = data;
  } catch (err) {
    console.error('Failed to fetch org users:', err);
  }
}

const availableUsers = computed(() => {
  const assignedIds = new Set(members.value.map((u: any) => u.id));
  let filtered = allOrgUsers.value.filter((u: any) => !assignedIds.has(u.id));
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    filtered = filtered.filter((u: any) => {
      const name = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase();
      return name.includes(q) || u.email?.toLowerCase().includes(q);
    });
  }
  return filtered;
});

async function addMember(userId: string) {
  try {
    await junctionItems.create({
      projects_id: props.projectId,
      directus_users_id: userId,
    });
    await fetchMembers();
    emit('updated');
  } catch (err) {
    console.error('Failed to add team member:', err);
  }
}

async function removeMember(userId: string) {
  try {
    const junctions = await junctionItems.list({
      filter: {
        _and: [
          { projects_id: { _eq: props.projectId } },
          { directus_users_id: { _eq: userId } },
        ],
      },
      fields: ['id'],
      limit: 1,
    });
    if (junctions.length > 0) {
      await junctionItems.remove(junctions[0].id);
      await fetchMembers();
      emit('updated');
    }
  } catch (err) {
    console.error('Failed to remove team member:', err);
  }
}

function getAvatarUrl(user: any) {
  if (!user?.avatar) return null;
  const avatarId = typeof user.avatar === 'object' ? user.avatar.id : user.avatar;
  if (!avatarId) return null;
  return `${config.public.directusUrl}/assets/${avatarId}?key=avatar`;
}

function getInitials(user: any) {
  const first = user?.first_name?.[0] || '';
  const last = user?.last_name?.[0] || '';
  return (first + last).toUpperCase() || '?';
}

onMounted(() => {
  fetchMembers();
  fetchOrgUsers();
});
</script>
