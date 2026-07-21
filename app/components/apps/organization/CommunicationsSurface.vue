<!--
	CommunicationsSurface — transactional email settings for the Communications
	("Email") floor of /apps/organization.

	This is the ORG-level *transactional* email surface: the branding wrapper
	applied to system emails (receipts, invites, notifications, meeting emails)
	— reply-to address, footer mailing address, silent BCC, and the whitelabel
	toggle — plus a live preview of any transactional template rendered with
	this org's branding.

	NOT the marketing/newsletter HTML builder (that stays in the Marketing app,
	app/components/Newsletter/*). Extracted from the classic /organization page's
	"Email Branding" section so the modern Apps shell no longer punches out to it.

	Save pattern mirrors OverviewEditor: `organizationItems.update` then refresh
	`useOrganization().fetchOrganizationDetails()` so every currentOrg consumer
	repaints.
-->
<script setup lang="ts">
const toast = useToast();
const organizationItems = useDirectusItems('organizations');
const { selectedOrg, fetchOrganizationDetails } = useOrganization();

defineProps<{
	canManage?: boolean;
}>();

const emit = defineEmits<{
	(e: 'saved'): void;
}>();

const ORG_FIELDS = ['id', 'name', 'email_reply_to', 'mailing_address', 'email_bcc', 'whitelabel'];

const org = ref<any>(null);
const loading = ref(false);

async function fetchOrg() {
	if (!selectedOrg.value) return;
	loading.value = true;
	try {
		const rows = await organizationItems.list({
			filter: { id: { _eq: selectedOrg.value } },
			fields: ORG_FIELDS,
			limit: 1,
		});
		org.value = rows?.[0] || null;
	} catch (err: any) {
		console.error('CommunicationsSurface fetch failed:', err);
		org.value = null;
	} finally {
		loading.value = false;
	}
}

watch(selectedOrg, () => fetchOrg(), { immediate: true });

// ── Transactional branding form ──────────────────────────────────────────────
const saving = ref(false);
const form = ref({
	email_reply_to: '',
	mailing_address: '',
	email_bcc: '',
	whitelabel: false,
});

watch(org, (o) => {
	if (!o) return;
	form.value = {
		email_reply_to: o.email_reply_to || '',
		mailing_address: o.mailing_address || '',
		email_bcc: o.email_bcc || '',
		whitelabel: o.whitelabel === true,
	};
}, { immediate: true });

async function save() {
	if (!org.value?.id) return;
	saving.value = true;
	try {
		await organizationItems.update(org.value.id, {
			email_reply_to: form.value.email_reply_to || null,
			mailing_address: form.value.mailing_address || null,
			email_bcc: form.value.email_bcc || null,
			whitelabel: form.value.whitelabel,
		});
		toast.add({ title: 'Saved', description: 'Email settings updated', color: 'green' });
		await fetchOrg();
		await fetchOrganizationDetails();
		emit('saved');
	} catch (err: any) {
		const msg = err?.data?.message || err?.message || 'Failed to update email settings';
		toast.add({ title: 'Error', description: msg, color: 'red' });
	} finally {
		saving.value = false;
	}
}

// ── Live preview ─────────────────────────────────────────────────────────────
// Mirrors the classic page: renders a transactional template through this org's
// branding via the server preview endpoint.
// Values must match the server preview endpoint's TEMPLATES list
// (server/api/email/preview.get.ts) — unknown names 400.
const previewTemplate = ref('notification');
const previewTemplates = [
	{ value: 'welcome', label: 'Welcome (Earnest-branded)' },
	{ value: 'notification', label: 'Notification' },
	{ value: 'meeting-invited', label: 'Meeting invite' },
	{ value: 'meeting-reminder', label: 'Meeting reminder' },
	{ value: 'meeting-cancelled', label: 'Meeting cancelled' },
	{ value: 'video-invite', label: 'Video room invite' },
];
const previewUrl = computed(() => {
	if (!org.value?.id) return '';
	const params = new URLSearchParams({
		template: previewTemplate.value,
		org: String(org.value.id),
	});
	return `/api/email/preview?${params.toString()}`;
});
</script>

<template>
	<div v-if="!org && loading" class="flex flex-col items-center justify-center py-16 gap-3">
		<span class="spinner-ios spinner-ios--lg" role="status" aria-label="Loading" />
		<p class="text-sm text-muted-foreground">Loading email settings…</p>
	</div>

	<div v-else-if="org" class="grid grid-cols-1 lg:grid-cols-2 gap-5">
		<!-- Settings -->
		<div class="space-y-5">
			<div class="ios-card p-5">
				<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
					Transactional email
				</h3>
				<p class="text-xs text-muted-foreground mb-4">
					Branding applied to system emails — receipts, invites, notifications, and meeting emails.
				</p>

				<div class="space-y-3">
					<UFormGroup label="Reply-to address" help="Where replies to system emails go.">
						<UInput
							v-model="form.email_reply_to"
							type="email"
							placeholder="hello@yourdomain.com"
							:disabled="!canManage"
						/>
					</UFormGroup>

					<UFormGroup label="Footer mailing address" help="Shown in the email footer (CAN-SPAM).">
						<UTextarea
							v-model="form.mailing_address"
							placeholder="123 Main St, Suite 100, City, ST 00000"
							:rows="2"
							autoresize
							:disabled="!canManage"
						/>
					</UFormGroup>

					<UFormGroup label="Silent BCC" help="A blind copy of every outbound email, for your records.">
						<UInput
							v-model="form.email_bcc"
							type="email"
							placeholder="archive@yourdomain.com"
							:disabled="!canManage"
						/>
					</UFormGroup>

					<UFormGroup label="White-label">
						<div class="flex items-center gap-3">
							<UToggle v-model="form.whitelabel" :disabled="!canManage" />
							<span class="text-xs text-muted-foreground">
								{{ form.whitelabel ? 'Earnest branding removed from emails' : 'Earnest branding shown in email footer' }}
							</span>
						</div>
					</UFormGroup>

					<div v-if="canManage" class="flex justify-end pt-1">
						<Button size="sm" :disabled="saving" @click="save">
							<Icon
								:name="saving ? 'lucide:loader-2' : 'lucide:save'"
								class="w-4 h-4 mr-1"
								:class="saving && 'animate-spin'"
							/>
							Save
						</Button>
					</div>
				</div>
			</div>

			<div class="ios-card p-5">
				<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
					Inbound email
				</h3>
				<p class="text-xs text-muted-foreground">
					Inbound mail forwarding (name.com) captures replies into Earnest. It's configured at your
					domain registrar, outside Earnest.
				</p>
			</div>
		</div>

		<!-- Live preview -->
		<div class="ios-card p-5">
			<div class="flex items-center justify-between gap-3 mb-4">
				<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
					Preview
				</h3>
				<select
					v-model="previewTemplate"
					class="rounded-full border bg-background px-3 py-1.5 text-xs"
				>
					<option v-for="t in previewTemplates" :key="t.value" :value="t.value">{{ t.label }}</option>
				</select>
			</div>
			<div class="rounded-xl border border-border/40 overflow-hidden bg-white">
				<iframe
					v-if="previewUrl"
					:src="previewUrl"
					title="Email preview"
					class="w-full"
					style="height: 560px; border: 0;"
				/>
			</div>
		</div>
	</div>
</template>
