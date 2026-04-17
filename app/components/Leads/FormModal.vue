<template>
	<UModal v-model="isOpen" class="sm:max-w-lg">
		<template #header>
			<div class="w-full space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-bold uppercase tracking-wide">{{ isEditing ? 'Edit Lead' : 'New Lead' }}</h3>
					<Button variant="ghost" size="icon-sm" @click="isOpen = false">
						<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
					</Button>
				</div>
				<FormStatusTimeline
					v-if="isEditing"
					v-model:currentStatus="form.stage"
					:statuses="stageStatuses"
					collection="leads"
					:itemId="String(lead?.id)"
					@status-change="handleStageChange"
				/>
			</div>
		</template>

		<form @submit.prevent="handleSubmit" class="space-y-4 p-4 max-h-[70vh] overflow-y-auto">
			<!-- Priority -->
			<div class="max-w-xs">
				<TicketsDetailsPriority v-model="form.priority" />
			</div>

			<!-- Contact (read-only for edit, preselected for new-from-contact flow) -->
			<div v-if="displayContact" class="ios-card p-3 space-y-1">
				<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider">Contact</p>
				<p class="text-sm font-medium t-text">
					{{ displayContact.first_name }} {{ displayContact.last_name }}
				</p>
				<p v-if="displayContact.email" class="text-xs t-text-secondary">{{ displayContact.email }}</p>
				<p v-if="displayContact.company" class="text-xs t-text-secondary">{{ displayContact.company }}</p>
			</div>

			<!-- Estimated Value + Source -->
			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Estimated Value</label>
					<UInput v-model="form.estimated_value" type="number" placeholder="$0" />
				</div>
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Source</label>
					<select
						v-model="form.source"
						class="w-full rounded-full border bg-background px-3 py-2 text-sm"
					>
						<option value="">Select source</option>
						<option value="website">Website</option>
						<option value="referral">Referral</option>
						<option value="call">Call</option>
						<option value="event">Event</option>
						<option value="business card">Business Card</option>
						<option value="linkedin">LinkedIn</option>
						<option value="cold_outreach">Cold Outreach</option>
					</select>
				</div>
			</div>

			<!-- Tags -->
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Tags</label>
				<div class="flex flex-wrap items-center gap-1.5">
					<span
						v-for="tag in form.tags"
						:key="tag"
						class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
					>
						{{ tag }}
						<button type="button" class="text-muted-foreground hover:text-destructive" @click="removeTag(tag)">
							<Icon name="lucide:x" class="h-3 w-3" />
						</button>
					</span>
					<UInput
						v-model="tagInput"
						size="xs"
						class="w-28"
						placeholder="Add tag"
						@keydown.enter.prevent="addTag"
						@keydown.,.prevent="addTag"
						@blur="addTag"
					/>
				</div>
			</div>

			<!-- Notes -->
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Notes</label>
				<UTextarea v-model="form.notes" :rows="3" placeholder="Add notes about this lead..." />
			</div>

			<!-- Next Follow-up -->
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Next Follow-up</label>
				<UInput v-model="form.next_follow_up" type="datetime-local" />
			</div>

			<!-- Assigned To -->
			<UiAssignmentPicker
				:modelValue="assignedUserIds"
				@update:modelValue="handleAssignmentChange"
				:users="availableUsers"
				label="Assigned To"
				empty-text="No one assigned"
				:multiple="false"
				@added="handleUserAdded"
				@removed="handleUserRemoved"
			/>
		</form>

		<template #footer>
			<div class="flex items-center justify-between w-full">
				<div class="flex items-center gap-1">
					<UTooltip v-if="isEditing" text="Delete">
						<Button
							variant="ghost"
							size="icon-sm"
							class="text-destructive hover:text-destructive hover:bg-destructive/10"
							:disabled="saving"
							@click="handleDelete"
						>
							<Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
						</Button>
					</UTooltip>
					<Button size="sm" :disabled="saving" @click="handleSubmit">
						<Icon v-if="saving" name="lucide:loader-2" class="h-3.5 w-3.5 mr-1 animate-spin" />
						<Icon v-else name="lucide:save" class="h-3.5 w-3.5 mr-1" />
						{{ isEditing ? 'Save' : 'Create' }}
					</Button>
				</div>
				<NuxtLink
					v-if="isEditing"
					:to="`/leads/${lead.id}`"
					class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
				>
					Full Details
					<Icon name="lucide:chevron-right" class="w-3 h-3" />
				</NuxtLink>
			</div>
		</template>
	</UModal>
</template>

<script setup>
import { Button } from '~/components/ui/button';
import { LEAD_STAGE_LABELS } from '~~/shared/leads';
import { useFilteredUsers } from '~/composables/useFilteredUsers';

const props = defineProps({
	lead: { type: Object, default: null },
	organizationId: { type: String, default: null },
	contactId: { type: String, default: null },
	contact: { type: Object, default: null },
});

const emit = defineEmits(['created', 'updated', 'deleted', 'convert', 'lost']);

const isOpen = defineModel({ default: false });
const isEditing = computed(() => !!props.lead?.id);
const saving = ref(false);

const { createLead, updateLead } = useLeads();
const { selectedOrg } = useOrganization();
const { filteredUsers, fetchFilteredUsers } = useFilteredUsers();
const toast = useToast();

const stageStatuses = Object.entries(LEAD_STAGE_LABELS).map(([id, name]) => ({ id, name }));

const displayContact = computed(() => {
	if (isEditing.value && props.lead?.related_contact) return props.lead.related_contact;
	if (props.contact) return props.contact;
	return null;
});

const form = reactive({
	stage: 'new',
	priority: 'low',
	estimated_value: '',
	source: '',
	notes: '',
	next_follow_up: '',
	assigned_to: null,
	tags: [],
});

const tagInput = ref('');

function addTag() {
	const raw = tagInput.value.trim();
	if (!raw) return;
	if (!form.tags.includes(raw)) form.tags.push(raw);
	tagInput.value = '';
}

function removeTag(tag) {
	form.tags = form.tags.filter((t) => t !== tag);
}

const initialAssignedUsers = ref([]);

const availableUsers = computed(() => {
	const fetched = filteredUsers.value || [];
	const merged = [...fetched];
	for (const u of initialAssignedUsers.value) {
		if (u?.id && !merged.some(m => m.id === u.id)) {
			merged.push(u);
		}
	}
	return merged;
});

const assignedUserIds = computed(() => form.assigned_to ? [form.assigned_to] : []);

function handleAssignmentChange(ids) {
	form.assigned_to = ids.length > 0 ? ids[0] : null;
}

function handleUserAdded(userId) {
	form.assigned_to = userId;
}

function handleUserRemoved() {
	form.assigned_to = null;
}

function handleStageChange(e) {
	const newStage = e.newStatus;
	if (newStage === 'won') {
		emit('convert', props.lead);
		return;
	}
	if (newStage === 'lost') {
		emit('lost', props.lead);
		return;
	}
	form.stage = newStage;
}

function populateForm() {
	if (props.lead) {
		form.stage = props.lead.stage || 'new';
		form.priority = props.lead.priority || 'low';
		form.estimated_value = props.lead.estimated_value || '';
		form.source = props.lead.source || '';
		form.notes = props.lead.notes || '';
		form.tags = Array.isArray(props.lead.tags) ? [...props.lead.tags] : [];
		form.assigned_to = typeof props.lead.assigned_to === 'object'
			? props.lead.assigned_to?.id
			: props.lead.assigned_to || null;

		if (props.lead.assigned_to && typeof props.lead.assigned_to === 'object') {
			initialAssignedUsers.value = [props.lead.assigned_to];
		}

		if (props.lead.next_follow_up) {
			try {
				const d = new Date(props.lead.next_follow_up);
				const pad = (n) => String(n).padStart(2, '0');
				form.next_follow_up = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
			} catch { form.next_follow_up = ''; }
		} else {
			form.next_follow_up = '';
		}
	} else {
		Object.assign(form, {
			stage: 'new',
			priority: 'low',
			estimated_value: '',
			source: '',
			notes: '',
			next_follow_up: '',
			assigned_to: null,
			tags: [],
		});
	}
	tagInput.value = '';
}

watch(isOpen, (val) => {
	if (val) {
		populateForm();
		loadUsers();
	}
});

async function loadUsers() {
	const orgId = props.organizationId || selectedOrg.value;
	if (orgId) {
		try {
			await fetchFilteredUsers(orgId);
		} catch {}
	}
}

async function handleSubmit() {
	saving.value = true;

	// flush any pending tag input
	if (tagInput.value.trim()) addTag();

	const payload = {
		stage: form.stage,
		priority: form.priority,
		estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
		source: form.source || null,
		notes: form.notes || null,
		next_follow_up: form.next_follow_up ? new Date(form.next_follow_up).toISOString() : null,
		assigned_to: form.assigned_to || null,
		tags: form.tags.length ? form.tags : null,
	};

	if (!isEditing.value && props.contactId) {
		payload.related_contact = props.contactId;
	}

	try {
		if (isEditing.value) {
			await updateLead(props.lead.id, payload);
			toast.add({ title: 'Lead updated', color: 'green' });
			emit('updated');
		} else {
			const created = await createLead(payload);
			toast.add({ title: 'Lead created', color: 'green' });
			emit('created', created);
		}
		isOpen.value = false;
	} catch (err) {
		console.error('Error saving lead:', err);
		toast.add({ title: 'Failed to save lead', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value) return;
	if (!confirm('Are you sure you want to delete this lead? This cannot be undone.')) return;

	saving.value = true;
	try {
		await useDirectusItems('leads').remove(props.lead.id);
		toast.add({ title: 'Lead deleted', color: 'green' });
		emit('deleted');
		isOpen.value = false;
	} catch (err) {
		console.error('Error deleting lead:', err);
		toast.add({ title: 'Failed to delete lead', color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>
