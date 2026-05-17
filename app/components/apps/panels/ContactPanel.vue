<!--
  ContactPanel — slide-over body for a single contact.

  Mounted by `<AppSlideOverStack>` when the global stack contains a
  `contact:<id>` entry. Fetches its own data so it survives both the
  page that triggered it being unmounted and reloads on a deep-linked
  `?slide=contact:<id>` URL.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();

defineEmits<{ (e: 'close'): void }>();

const contactItemsApi = useDirectusItems('contacts');
const { selectedOrg } = useOrganization();

const contact = ref<any | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const title = computed(() => {
	const c = contact.value;
	if (!c) return 'Contact';
	const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
	return name || 'Contact';
});

watch(
	() => props.id,
	async (id) => {
		if (!id) return;
		loading.value = true;
		error.value = null;
		contact.value = null;
		try {
			const fetched = await contactItemsApi.get(id, {
				fields: ['*', 'client.id', 'client.name', 'organizations.organizations_id'],
			});
			// Verify the contact belongs to the currently-selected org before
			// rendering. Directus's row-perm fallback on `user_created` lets a
			// user re-read contacts they originally created in a previous org;
			// the M2M junction is the authoritative tenant filter.
			const orgIds: string[] = Array.isArray(fetched?.organizations)
				? fetched.organizations
					.map((j: any) => (typeof j === 'object' ? j?.organizations_id : null))
					.filter(Boolean)
				: [];
			if (!selectedOrg.value || !orgIds.includes(selectedOrg.value)) {
				error.value = 'Contact not found in this organization';
				contact.value = null;
			} else {
				contact.value = fetched;
			}
		} catch (err: any) {
			error.value = err?.message || 'Failed to load contact';
		} finally {
			loading.value = false;
		}
	},
	{ immediate: true },
);
</script>

<template>
	<AppSlideOverShell :title="title" @close="$emit('close')">
		<div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			<p class="text-xs text-muted-foreground">Loading contact…</p>
		</div>

		<div v-else-if="contact" class="space-y-5">
			<div class="flex items-center gap-3">
				<div
					class="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0"
				>
					{{ (contact.first_name || '?').charAt(0) }}{{ (contact.last_name || '').charAt(0) }}
				</div>
				<div class="min-w-0">
					<p class="text-base font-semibold truncate">
						{{ contact.first_name }} {{ contact.last_name }}
					</p>
					<p
						v-if="contact.title || contact.company"
						class="text-xs text-muted-foreground truncate"
					>
						{{ [contact.title, contact.company].filter(Boolean).join(' · ') }}
					</p>
				</div>
			</div>

			<div class="space-y-2.5 text-sm">
				<div v-if="contact.email" class="flex items-center gap-2">
					<Icon name="lucide:mail" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
					<a
						:href="`mailto:${contact.email}`"
						class="font-mono text-xs hover:text-primary truncate"
					>
						{{ contact.email }}
					</a>
				</div>
				<div v-if="contact.phone" class="flex items-center gap-2">
					<Icon name="lucide:phone" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
					<a :href="`tel:${contact.phone}`" class="text-xs hover:text-primary">
						{{ contact.phone }}
					</a>
				</div>
				<div v-if="contact.client?.name" class="flex items-center gap-2">
					<Icon name="lucide:building-2" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
					<span class="text-xs">{{ contact.client.name }}</span>
				</div>
				<div v-if="contact.category" class="flex items-center gap-2">
					<Icon name="lucide:tag" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
					<span class="text-xs capitalize">{{ contact.category }}</span>
				</div>
			</div>

			<div v-if="contact.notes" class="space-y-1 pt-3 border-t border-border/30">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</p>
				<p class="text-sm whitespace-pre-wrap">{{ contact.notes }}</p>
			</div>

			<div class="pt-3 border-t border-border/30">
				<NuxtLink
					:to="`/contacts/${id}`"
					class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
				>
					Open full contact page
					<Icon name="lucide:external-link" class="w-3 h-3" />
				</NuxtLink>
			</div>
		</div>

		<div v-else-if="error" class="text-sm text-destructive py-10 text-center">
			{{ error }}
		</div>

		<div v-else class="text-sm text-muted-foreground py-10 text-center">
			Could not load contact.
		</div>
	</AppSlideOverShell>
</template>
