<!--
  MailingListWorkspace — shared body for the mailing-list detail surface.

  Consumed by both the `/lists/[id]` full-page route AND the
  `mailing-list` slide-over panel (`<MailingListPanel>`). Pass `:listId`;
  the component fetches itself. Emits `@loaded` with the list record
  (panel uses it to populate the slide-over shell title).

  `:compact` hides chrome the slide-over shell already provides (back
  link + inline h1/subtitle + Ask Earnest button + AI sidebar overlay,
  which would render inside the slide-over's transformed container
  instead of at viewport level — see [AppSlideOverShell.vue]).
-->
<script setup lang="ts">
import type { MailingList, Contact } from '~~/shared/email/contacts';

const props = defineProps<{
  listId: string | number;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'loaded', list: MailingList): void;
  (e: 'close'): void;
}>();

const { getList, getListContacts, updateSubscriberCount } = useMailingLists();
const { removeFromList } = useContacts();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();
const { push: pushSlideOver } = useAppSlideOverStack();
const toast = useToast();
const refreshSignal = useState<number>('mailing-lists-refresh', () => 0);

const list = ref<MailingList | null>(null);
const contacts = ref<Contact[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const showEditModal = ref(false);
const removingId = ref<string | number | null>(null);

async function load() {
  if (!props.listId) return;
  loading.value = true;
  error.value = null;
  try {
    const id = Number(props.listId);
    const [l, members] = await Promise.all([
      getList(id),
      getListContacts(id).catch(() => [] as Contact[]),
    ]);
    list.value = l;
    contacts.value = members;
    if (l) emit('loaded', l);
  } catch (err: any) {
    error.value = err?.message || 'Failed to load mailing list';
  } finally {
    loading.value = false;
  }
}

watch(() => props.listId, load, { immediate: true });

async function handleRemove(contact: Contact) {
  if (!list.value) return;
  if (!confirm(`Remove ${contact.first_name} ${contact.last_name} from this list?`)) return;
  removingId.value = contact.id;
  try {
    await removeFromList(contact.id, Number(list.value.id));
    await updateSubscriberCount(Number(list.value.id));
    contacts.value = contacts.value.filter((c) => c.id !== contact.id);
    refreshSignal.value++;
    toast.add({ title: 'Removed from list', color: 'green' });
  } catch (err: any) {
    toast.add({ title: 'Failed to remove', description: err?.message, color: 'red' });
  } finally {
    removingId.value = null;
  }
}

function onListUpdated(updated: MailingList) {
  list.value = updated;
  showEditModal.value = false;
  refreshSignal.value++;
  emit('loaded', updated);
}

function onListDeleted() {
  refreshSignal.value++;
  emit('close');
}

function openContact(contactId: string | number) {
  if (props.compact) {
    pushSlideOver('contact', String(contactId));
  } else {
    // allow-legacy-link — full-page mode doesn't have a slide-over stack to push into.
    pushSlideOver('contact', String(contactId));
  }
}

const subscriberCount = computed(() => contacts.value.length);

if (!props.compact) {
  watch(list, (l) => {
    if (l) setEntity('list', String(l.id), l.name || 'Mailing List');
  }, { immediate: true });
  onUnmounted(() => clearEntity());

  watch(list, (l) => {
    if (l && !props.compact) useHead({ title: `${l.name || 'List Details'} | Earnest` });
  }, { immediate: true });
}

defineExpose({ openEdit: () => { showEditModal.value = true; } });
</script>

<template>
  <div>
    <!-- Full-page header — slide-over shell shows title + subtitle in compact mode -->
    <div v-if="!compact && list" class="flex items-start justify-between gap-3 mb-6">
      <div class="flex items-center gap-3">
        <!-- allow-legacy-link — full-page mode breadcrumb to /lists list -->
        <NuxtLink to="/lists" class="text-muted-foreground hover:text-foreground">
          <Icon name="lucide:chevron-left" class="w-5 h-5" />
        </NuxtLink>
        <div>
          <h1 class="text-xl font-semibold">{{ list.name }}</h1>
          <p class="text-sm text-muted-foreground">
            {{ subscriberCount }} active subscriber{{ subscriberCount === 1 ? '' : 's' }}
            <span v-if="list.description" class="ml-2">— {{ list.description }}</span>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          @click="showEditModal = true"
        >
          <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Edit</span>
        </button>
        <button
          class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
          @click="sidebarOpen = true"
        >
          <EarnestIcon class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">Ask Earnest</span>
        </button>
      </div>
    </div>

    <div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
      <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
      <p class="text-xs text-muted-foreground">Loading list…</p>
    </div>

    <div v-else-if="error" class="text-sm text-destructive py-10 text-center">
      {{ error }}
    </div>

    <div v-else-if="list" class="space-y-5">
      <!-- Description + flags (compact mode only — full page surfaces them in the header) -->
      <div
        v-if="compact && (list.description || (list as any).is_default || (list as any).double_opt_in)"
        class="space-y-2"
      >
        <p v-if="list.description" class="text-sm text-foreground/90">{{ list.description }}</p>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-if="(list as any).is_default"
            class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary"
          >
            <Icon name="lucide:star" class="w-3 h-3" />
            Default
          </span>
          <span
            v-if="(list as any).double_opt_in"
            class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-warning/10 text-warning"
          >
            <Icon name="lucide:shield-check" class="w-3 h-3" />
            Double opt-in
          </span>
        </div>
      </div>

      <!-- Members -->
      <div :class="{ 'pt-3 border-t border-border/30': compact }">
        <div class="flex items-center justify-between mb-3">
          <p class="text-[10px] uppercase tracking-wider text-muted-foreground">
            Members
            <span v-if="subscriberCount" class="text-foreground ml-1">({{ subscriberCount }})</span>
          </p>
        </div>

        <div v-if="!contacts.length" class="text-center py-8 text-xs text-muted-foreground">
          <Icon name="lucide:users" class="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p>No members in this list yet.</p>
        </div>

        <ul v-else class="divide-y divide-border/30">
          <li
            v-for="contact in contacts"
            :key="contact.id"
            class="flex items-center gap-3 py-2.5"
          >
            <button
              type="button"
              class="flex-1 min-w-0 text-left hover:text-primary transition-colors"
              @click="openContact(contact.id)"
            >
              <p class="text-sm font-medium truncate">
                {{ contact.first_name }} {{ contact.last_name }}
              </p>
              <p class="text-[11px] text-muted-foreground truncate">
                {{ contact.email }}
                <span v-if="contact.company" class="ml-1.5">· {{ contact.company }}</span>
              </p>
            </button>
            <ContactStatusBadge v-if="contact.status" :status="contact.status" />
            <button
              type="button"
              class="text-[10px] uppercase tracking-wider px-2 h-6 rounded-full border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors disabled:opacity-40"
              :disabled="removingId === contact.id"
              @click="handleRemove(contact)"
            >
              <Icon v-if="removingId === contact.id" name="lucide:loader-2" class="w-3 h-3 animate-spin" />
              <span v-else>Remove</span>
            </button>
          </li>
        </ul>
      </div>
    </div>

    <div v-else class="text-sm text-muted-foreground py-10 text-center">
      Could not load mailing list.
    </div>

    <!-- Edit modal — renders above the slide-over via Dialog z-[70] -->
    <ListsFormModal
      v-if="list"
      v-model="showEditModal"
      :list="list"
      @updated="onListUpdated"
      @deleted="onListDeleted"
    />

    <ClientOnly v-if="!compact">
      <AIContextualSidebar
        v-if="sidebarOpen && list"
        entity-type="list"
        :entity-id="String(list.id)"
        :entity-label="list.name || 'Mailing List'"
        @close="closeSidebar"
      />
      <Transition name="overlay">
        <div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
      </Transition>
    </ClientOnly>
  </div>
</template>
