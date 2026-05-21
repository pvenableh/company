<!--
  ArchiveOrgSheet — destructive confirm bottom sheet for archiving (or
  restoring) the current organization. Replaces the Danger-zone button
  on the Settings floor that previously bounced out to the legacy
  /organization?tab=overview page.

  Calls the same POST /api/org/:id/archive and /restore endpoints as
  the legacy modal. On success, refreshes org details so the apps
  shell sees the new archived_at value and the archived banner appears
  / disappears.
-->
<script setup lang="ts">
import AppBottomSheet from '../AppBottomSheet.vue';

const props = defineProps<{
	modelValue: boolean;
	orgId: string | null;
	orgName: string;
	isArchived: boolean;
}>();
const emit = defineEmits<{
	(e: 'update:modelValue', v: boolean): void;
	(e: 'changed'): void;
}>();

const toast = useToast();
const { fetchOrganizationDetails } = useOrganization();

const submitting = ref(false);

function close() {
	if (submitting.value) return;
	emit('update:modelValue', false);
}

async function confirmArchive() {
	if (!props.orgId || submitting.value) return;
	submitting.value = true;
	try {
		const res = await $fetch<{ alreadyArchived?: boolean; stripe?: { current_period_end?: number } }>(
			`/api/org/${props.orgId}/archive`,
			{ method: 'POST' },
		);
		const msg = res?.alreadyArchived
			? 'Organization was already archived.'
			: res?.stripe?.current_period_end
				? `Archived. Subscription cancels at period end (${new Date((res.stripe.current_period_end || 0) * 1000).toLocaleDateString()}).`
				: 'Organization archived.';
		toast.add({ title: 'Archived', description: msg, color: 'amber' });
		await fetchOrganizationDetails();
		emit('changed');
		emit('update:modelValue', false);
	} catch (err: any) {
		toast.add({
			title: 'Archive failed',
			description: err?.data?.message || err?.message || 'Could not archive organization.',
			color: 'red',
		});
	} finally {
		submitting.value = false;
	}
}

async function confirmRestore() {
	if (!props.orgId || submitting.value) return;
	submitting.value = true;
	try {
		const res = await $fetch<{ resubscribeRequired?: boolean }>(
			`/api/org/${props.orgId}/restore`,
			{ method: 'POST' },
		);
		const msg = res?.resubscribeRequired
			? 'Restored. Previous subscription ended — re-subscribe from the Billing floor.'
			: 'Organization restored.';
		toast.add({ title: 'Restored', description: msg, color: 'green' });
		await fetchOrganizationDetails();
		emit('changed');
		emit('update:modelValue', false);
	} catch (err: any) {
		toast.add({
			title: 'Restore failed',
			description: err?.data?.message || err?.message || 'Could not restore organization.',
			color: 'red',
		});
	} finally {
		submitting.value = false;
	}
}

const title = computed(() => (props.isArchived ? 'Restore organization' : 'Archive organization'));
const subtitle = computed(() => props.orgName);
</script>

<template>
	<AppBottomSheet
		:model-value="modelValue"
		:title="title"
		:subtitle="subtitle"
		@update:model-value="emit('update:modelValue', $event)"
	>
		<div v-if="!isArchived" class="space-y-3">
			<div class="ios-card border border-destructive/30 bg-destructive/5 p-4 flex gap-3">
				<Icon name="lucide:archive" class="w-5 h-5 text-destructive shrink-0 mt-0.5" />
				<div class="text-sm space-y-2">
					<p class="font-medium text-destructive">This will archive {{ orgName }}.</p>
					<ul class="text-xs text-muted-foreground space-y-1 list-disc pl-4">
						<li>The subscription will be set to cancel at the end of the current billing period.</li>
						<li>All data is soft-deleted and retained for 90 days, after which it is permanently removed.</li>
						<li>Members lose access immediately; you can restore from this same screen within 90 days.</li>
					</ul>
				</div>
			</div>
		</div>

		<div v-else class="space-y-3">
			<div class="ios-card border border-warning/30 bg-warning/10 p-4 flex gap-3">
				<Icon name="lucide:archive-restore" class="w-5 h-5 text-warning shrink-0 mt-0.5" />
				<div class="text-sm space-y-2">
					<p class="font-medium text-warning">Restore {{ orgName }} to full access.</p>
					<ul class="text-xs text-muted-foreground space-y-1 list-disc pl-4">
						<li>Members regain access immediately.</li>
						<li>If the previous subscription has ended, you'll need to re-subscribe from the Billing floor.</li>
					</ul>
				</div>
			</div>
		</div>

		<template #footer>
			<div class="flex items-center justify-end gap-2">
				<button
					type="button"
					class="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 ios-press transition-colors"
					:disabled="submitting"
					@click="close"
				>
					Cancel
				</button>
				<button
					v-if="!isArchived"
					type="button"
					class="rounded-full px-4 py-1.5 text-[11px] font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5 disabled:opacity-40"
					:disabled="submitting || !orgId"
					@click="confirmArchive"
				>
					<Icon :name="submitting ? 'lucide:loader-2' : 'lucide:archive'" class="w-3 h-3" :class="{ 'animate-spin': submitting }" />
					{{ submitting ? 'Archiving…' : 'Archive organization' }}
				</button>
				<button
					v-else
					type="button"
					class="rounded-full px-4 py-1.5 text-[11px] font-medium bg-warning text-warning-foreground hover:bg-warning/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5 disabled:opacity-40"
					:disabled="submitting || !orgId"
					@click="confirmRestore"
				>
					<Icon :name="submitting ? 'lucide:loader-2' : 'lucide:archive-restore'" class="w-3 h-3" :class="{ 'animate-spin': submitting }" />
					{{ submitting ? 'Restoring…' : 'Restore organization' }}
				</button>
			</div>
		</template>
	</AppBottomSheet>
</template>
