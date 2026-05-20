<!--
  MailingListPanel — slide-over body for a single mailing list.

  Replaces the full-page edit at /lists/[id] when opened from the Apps
  Layout. Shows list metadata + a scrollable member roster. Edit name /
  description / settings via the existing ListsFormModal (renders above
  the slide-over thanks to Dialog z-[70]). Removing a member calls the
  same useContacts.removeFromList path the classic page used.

  Cross-panel push: clicking a member opens ContactPanel on top.
  Escape: "Full Page" chip jumps to /lists/[id] for the legacy surface.
-->
<script setup lang="ts">
import type { MailingList, Contact } from '~~/shared/email/contacts';
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { getList, getListContacts, updateSubscriberCount } = useMailingLists();
const { removeFromList } = useContacts();
const { push } = useAppSlideOverStack();
const toast = useToast();
const refreshSignal = useState<number>('mailing-lists-refresh', () => 0);

const list = ref<MailingList | null>(null);
const contacts = ref<Contact[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const showEditModal = ref(false);
const removingId = ref<string | number | null>(null);

async function load() {
	if (!props.id) return;
	loading.value = true;
	error.value = null;
	try {
		const listId = Number(props.id);
		const [l, members] = await Promise.all([
			getList(listId),
			getListContacts(listId).catch(() => [] as Contact[]),
		]);
		list.value = l;
		contacts.value = members;
	} catch (err: any) {
		error.value = err?.message || 'Failed to load mailing list';
	} finally {
		loading.value = false;
	}
}

watch(() => props.id, load, { immediate: true });

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
}

function onListDeleted() {
	refreshSignal.value++;
	emit('close');
}

const subscriberCount = computed(() => contacts.value.length);
</script>

<template>
	<AppSlideOverShell
		:title="list?.name || 'Mailing List'"
		:subtitle="list ? `${subscriberCount} active subscriber${subscriberCount === 1 ? '' : 's'}` : null"
		@close="emit('close')"
	>
		<template v-if="list" #actions>
			<button
				type="button"
				class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				@click="showEditModal = true"
			>
				<Icon name="lucide:pencil" class="w-3 h-3" />
				Edit
			</button>
			<NuxtLink
				:to="`/lists/${list.id}`"
				class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				:title="`Open full page for ${list.name}`"
			>
				<Icon name="lucide:external-link" class="w-3 h-3" />
				Full Page
			</NuxtLink>
		</template>

		<div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			<p class="text-xs text-muted-foreground">Loading list…</p>
		</div>

		<div v-else-if="error" class="text-sm text-destructive py-10 text-center">
			{{ error }}
		</div>

		<div v-else-if="list" class="space-y-5">
			<!-- Description + flags -->
			<div v-if="list.description || (list as any).is_default || (list as any).double_opt_in" class="space-y-2">
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
			<div class="pt-3 border-t border-border/30">
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
							@click="push('contact', String(contact.id))"
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
	</AppSlideOverShell>
</template>
