<!--
  DirectorInvitePicker — pick org teammates (admins + members) to invite to the
  live Director's Office table. A searchable roster with avatars; already-seated
  people are shown but disabled. Emits the chosen user ids up to the office,
  which POSTs them to /sessions/[id]/invite (seats them + notifies them).
-->
<script setup lang="ts">
const props = defineProps<{
  organizationId: string;
  /** User ids already at the table (host + joined/invited) — shown as seated. */
  seatedIds?: string[];
}>();

const emit = defineEmits<{ invite: [userIds: string[]]; close: [] }>();

const config = useRuntimeConfig();

interface Member { userId: string; name: string; avatar: string | null; email: string | null; role: string | null; isSelf: boolean }

const members = ref<Member[]>([]);
const loading = ref(true);
const search = ref('');
const selected = ref<Set<string>>(new Set());
const sending = ref(false);

const seated = computed(() => new Set((props.seatedIds || []).map(String)));

async function load() {
  loading.value = true;
  try {
    const res = await $fetch<{ members: Member[] }>('/api/ai/director/members', {
      query: { organizationId: props.organizationId },
    });
    members.value = res.members || [];
  } catch {
    members.value = [];
  }
  loading.value = false;
}
onMounted(load);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  const list = members.value.filter((m) => !m.isSelf);
  if (!q) return list;
  return list.filter((m) => `${m.name} ${m.email || ''}`.toLowerCase().includes(q));
});

function toggle(m: Member) {
  if (seated.value.has(String(m.userId))) return;
  const next = new Set(selected.value);
  if (next.has(m.userId)) next.delete(m.userId);
  else next.add(m.userId);
  selected.value = next;
}

function avatarUrl(m: Member): string {
  if (m.avatar) return `${config.public.assetsUrl}${m.avatar}?key=avatar`;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=6366f1&color=fff&size=48`;
}

async function send() {
  if (!selected.value.size || sending.value) return;
  sending.value = true;
  emit('invite', Array.from(selected.value));
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" @click.self="emit('close')">
      <section class="w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl overflow-hidden">
        <header class="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <UIcon name="i-lucide-user-plus" class="w-4.5 h-4.5" />
            </span>
            <div class="min-w-0">
              <h3 class="text-sm font-semibold leading-tight">Invite to the table</h3>
              <p class="text-xs text-muted-foreground truncate">They'll be notified and can join live.</p>
            </div>
          </div>
          <button type="button" class="text-muted-foreground hover:text-foreground p-1" aria-label="Close" @click="emit('close')">
            <UIcon name="i-lucide-x" class="w-5 h-5" />
          </button>
        </header>

        <div class="px-5 pt-3">
          <div class="relative">
            <UIcon name="i-lucide-search" class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              v-model="search"
              type="text"
              placeholder="Search teammates…"
              class="w-full rounded-full border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div class="px-3 py-3 max-h-[46vh] overflow-y-auto">
          <div v-if="loading" class="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
            <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> Loading team…
          </div>
          <div v-else-if="!filtered.length" class="text-center text-sm text-muted-foreground py-8">
            No teammates found.
          </div>
          <ul v-else class="space-y-0.5">
            <li v-for="m in filtered" :key="m.userId">
              <button
                type="button"
                class="w-full flex items-center gap-3 px-2.5 py-2 rounded-2xl text-left transition-colors"
                :class="seated.has(String(m.userId)) ? 'opacity-50 cursor-default' : selected.has(m.userId) ? 'bg-primary/10' : 'hover:bg-muted'"
                :disabled="seated.has(String(m.userId))"
                @click="toggle(m)"
              >
                <img :src="avatarUrl(m)" :alt="m.name" class="w-9 h-9 rounded-full shrink-0 ring-1 ring-border" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium truncate">{{ m.name }}</p>
                  <p v-if="m.role" class="text-[11px] text-muted-foreground truncate capitalize">{{ m.role }}</p>
                </div>
                <span v-if="seated.has(String(m.userId))" class="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">At the table</span>
                <span
                  v-else
                  class="w-5 h-5 rounded-full border flex items-center justify-center shrink-0"
                  :class="selected.has(m.userId) ? 'bg-primary border-primary text-primary-foreground' : 'border-border'"
                >
                  <UIcon v-if="selected.has(m.userId)" name="i-lucide-check" class="w-3 h-3" />
                </span>
              </button>
            </li>
          </ul>
        </div>

        <footer class="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border">
          <span class="text-xs text-muted-foreground">{{ selected.size }} selected</span>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-full bg-primary text-primary-foreground disabled:opacity-50"
            :disabled="!selected.size || sending"
            @click="send"
          >
            <UIcon v-if="sending" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
            <UIcon v-else name="i-lucide-send" class="w-4 h-4" />
            Send invite{{ selected.size === 1 ? '' : 's' }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
