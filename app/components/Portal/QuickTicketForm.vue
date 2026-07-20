<script setup lang="ts">
/**
 * PortalQuickTicketForm
 * Self-contained ticket submission form for the client portal. Posts to
 * /api/portal/tickets which scopes the new row to the caller's
 * client_portal_users context (org + client). Used in two places:
 *   - portal/tickets.vue (page-level New Ticket button)
 *   - portal/index.vue (dashboard "Submit Ticket" CTA)
 *
 * The form expands inline (Transition) when v-model:open is true. On success
 * it emits `created` so the parent can refresh whatever list it owns.
 */

import { Button } from '~/components/ui/button';
import { toast } from 'vue-sonner';

const open = defineModel<boolean>('open', { default: false });

const emit = defineEmits<{
	(e: 'created'): void;
}>();

const submitting = ref(false);

const form = ref({
	title: '',
	description: '',
	priority: 'normal',
});

function reset() {
	form.value = { title: '', description: '', priority: 'normal' };
}

async function submit() {
	if (!form.value.title.trim()) return;
	submitting.value = true;
	try {
		await $fetch('/api/portal/tickets', {
			method: 'POST',
			body: {
				title: form.value.title.trim(),
				description: form.value.description.trim() || undefined,
				priority: form.value.priority,
			},
		});
		toast.success('Ticket submitted');
		reset();
		open.value = false;
		emit('created');
	} catch (err: any) {
		toast.error(err?.data?.message || err?.message || 'Failed to submit ticket');
	} finally {
		submitting.value = false;
	}
}

function close() {
	if (submitting.value) return;
	open.value = false;
	reset();
}
</script>

<template>
	<Transition name="expand">
		<div v-if="open" class="ios-card p-5">
			<div class="flex items-start justify-between mb-4">
				<div>
					<h2 class="font-medium">Submit a Ticket</h2>
					<p class="text-xs text-muted-foreground mt-0.5">Tell us what you need and we'll get back to you.</p>
				</div>
				<button
					class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
					:disabled="submitting"
					@click="close"
				>
					<Icon name="lucide:x" class="w-4 h-4" />
				</button>
			</div>

			<form class="space-y-4" @submit.prevent="submit">
				<div>
					<label class="text-sm font-medium mb-1 block">Title</label>
					<input
						v-model="form.title"
						type="text"
						placeholder="Brief description of your issue..."
						class="w-full rounded-xl glass-field px-4 py-2.5 text-sm focus:outline-none"
						required
					/>
				</div>

				<div>
					<label class="text-sm font-medium mb-1 block">Description</label>
					<textarea
						v-model="form.description"
						rows="4"
						placeholder="Provide additional details..."
						class="w-full rounded-xl glass-field px-4 py-2.5 text-sm focus:outline-none resize-none"
					/>
				</div>

				<div>
					<label class="text-sm font-medium mb-1 block">Priority</label>
					<select
						v-model="form.priority"
						class="rounded-xl glass-field px-4 py-2.5 text-sm focus:outline-none"
					>
						<option value="low">Low</option>
						<option value="normal">Normal</option>
						<option value="high">High</option>
						<option value="urgent">Urgent</option>
					</select>
				</div>

				<div class="flex justify-end">
					<Button type="submit" :disabled="submitting || !form.title.trim()">
						<Icon v-if="submitting" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
						{{ submitting ? 'Submitting...' : 'Submit Ticket' }}
					</Button>
				</div>
			</form>
		</div>
	</Transition>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
	transition: all 0.2s ease;
}
.expand-enter-from,
.expand-leave-to {
	opacity: 0;
	transform: translateY(-8px);
}
</style>
