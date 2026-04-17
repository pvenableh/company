<template>
	<UModal v-model="isOpen" class="sm:max-w-md">
		<template #header>
			<div class="flex items-center justify-between w-full">
				<h3 class="text-sm font-bold uppercase tracking-wide">Convert Lead to Client</h3>
				<Button variant="ghost" size="icon-sm" @click="handleCancel">
					<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
				</Button>
			</div>
		</template>

		<form @submit.prevent="handleConvert" class="space-y-4 p-4">
			<!-- Client Name -->
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Client Name *</label>
				<UInput v-model="form.name" placeholder="Company or client name" />
			</div>

			<!-- Contract Value -->
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Contract Value</label>
				<UInput v-model="form.contract_value" type="number" placeholder="$0" />
			</div>

			<!-- Primary Contact (read-only) -->
			<div v-if="lead?.related_contact" class="ios-card p-3">
				<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider mb-1">Primary Contact</p>
				<p class="text-sm font-medium t-text">
					{{ lead.related_contact.first_name }} {{ lead.related_contact.last_name }}
				</p>
				<p v-if="lead.related_contact.email" class="text-xs t-text-secondary">{{ lead.related_contact.email }}</p>
			</div>

			<!-- New contact (when lead has no related_contact) -->
			<div v-else class="ios-card p-3 space-y-2">
				<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider">
					New Contact
				</p>
				<p class="text-[11px] t-text-secondary">
					This lead has no contact yet. We&rsquo;ll create one and link it to the new client.
				</p>
				<div class="grid grid-cols-2 gap-2">
					<UInput v-model="contactForm.first_name" placeholder="First name" size="sm" />
					<UInput v-model="contactForm.last_name" placeholder="Last name" size="sm" />
				</div>
				<UInput v-model="contactForm.email" type="email" placeholder="Email" size="sm" />
			</div>

			<!-- Create Project Toggle -->
			<div class="space-y-3">
				<div class="flex items-center gap-3">
					<UToggle v-model="createProject" />
					<span class="text-xs font-medium t-text">Also create a project</span>
				</div>

				<template v-if="createProject">
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Project Title</label>
						<UInput v-model="projectForm.title" placeholder="Project title" />
					</div>
				</template>
			</div>

			<!-- Notes -->
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Conversion Notes</label>
				<UTextarea v-model="form.notes" :rows="2" placeholder="Optional notes..." />
			</div>
		</form>

		<template #footer>
			<div class="flex items-center gap-1">
				<Button size="sm" :disabled="saving || !form.name.trim()" @click="handleConvert">
					<Icon v-if="saving" name="lucide:loader-2" class="h-3.5 w-3.5 mr-1 animate-spin" />
					<Icon v-else name="lucide:check-circle" class="h-3.5 w-3.5 mr-1" />
					Convert to Client
				</Button>
			</div>
		</template>
	</UModal>
</template>

<script setup>
import { Button } from '~/components/ui/button';

const props = defineProps({
	lead: { type: Object, default: null },
});

const emit = defineEmits(['converted', 'cancelled']);

const isOpen = defineModel({ default: false });
const saving = ref(false);
const createProject = ref(false);

const { convertToClient } = useLeads();
const { triggerRefresh } = useLeadsStore();
const toast = useToast();

const form = reactive({
	name: '',
	contract_value: '',
	notes: '',
});

const projectForm = reactive({
	title: '',
});

const contactForm = reactive({
	first_name: '',
	last_name: '',
	email: '',
});

watch(isOpen, (val) => {
	if (val && props.lead) {
		const contact = props.lead.related_contact;
		form.name = contact?.company || `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || '';
		form.contract_value = props.lead.estimated_value || '';
		form.notes = '';
		createProject.value = false;
		projectForm.title = `${form.name} Project`;
		contactForm.first_name = '';
		contactForm.last_name = '';
		contactForm.email = '';
	}
});

function handleCancel() {
	isOpen.value = false;
	emit('cancelled');
}

async function handleConvert() {
	if (!form.name.trim()) return;
	saving.value = true;

	try {
		const clientData = {
			name: form.name.trim(),
			contract_value: form.contract_value ? Number(form.contract_value) : null,
			primary_contact: props.lead?.related_contact?.id || null,
		};

		const projectData = createProject.value && projectForm.title.trim()
			? { title: projectForm.title.trim() }
			: undefined;

		const contactData = !props.lead?.related_contact && (contactForm.first_name || contactForm.last_name || contactForm.email)
			? {
				first_name: contactForm.first_name.trim() || undefined,
				last_name: contactForm.last_name.trim() || undefined,
				email: contactForm.email.trim() || undefined,
			}
			: undefined;

		await convertToClient(props.lead.id, clientData, projectData, contactData ? { contactData } : undefined);

		toast.add({ title: 'Lead converted to client!', color: 'green' });
		triggerRefresh();
		emit('converted');
		isOpen.value = false;
	} catch (err) {
		console.error('Conversion failed:', err);
		toast.add({ title: 'Conversion failed', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>
