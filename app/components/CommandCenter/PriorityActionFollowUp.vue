<!--
  PriorityActionFollowUp — inline client follow-up quick-action for priority
  cards backed by a cold proposal, an overdue lead, or a CardDesk contact.

  · "Draft"  → drafts the email with Earnest (AI, grounded in the record) and
    opens it in the user's own mail client (mailto:). Falls back to a template
    skeleton if the AI draft is unavailable.
  · "Send"   → sends a branded follow-up to the client from Earnest via
    /api/followups/send (two-tap confirm). Hidden for CardDesk (personal
    networking — Draft-only) and when we have no contact email. If the org isn't
    on the outbound allow-list the API returns held=true and we point back to Draft.
-->
<script setup lang="ts">
import { toast } from 'vue-sonner';

interface FollowUp {
	toEmail: string | null;
	toName: string | null;
	subject: string;
	body: string;
	kind: 'proposal' | 'lead' | 'carddesk';
	refId: string;
}

const props = defineProps<{ followUp: FollowUp }>();
const emit = defineEmits<{ (e: 'sent'): void }>();

const { selectedOrg } = useOrganization();
const drafting = ref(false);
const sending = ref(false);
const confirming = ref(false);
// Cache the AI draft so Draft + Send reuse one generation.
const aiDraft = ref<{ subject: string; body: string } | null>(null);

const canSend = computed(() => !!props.followUp.toEmail && props.followUp.kind !== 'carddesk');

// Draft with Earnest (AI), falling back to the template skeleton on any failure.
async function resolveDraft(): Promise<{ subject: string; body: string }> {
	if (aiDraft.value) return aiDraft.value;
	try {
		const res = await $fetch<{ ok: boolean; subject?: string; body?: string }>('/api/followups/draft', {
			method: 'POST',
			body: { kind: props.followUp.kind, refId: props.followUp.refId, orgId: selectedOrg.value, toName: props.followUp.toName },
		});
		if (res?.ok && res.subject && res.body) {
			aiDraft.value = { subject: res.subject, body: res.body };
			return aiDraft.value;
		}
	} catch { /* fall through to template */ }
	return { subject: props.followUp.subject, body: props.followUp.body };
}

async function draft() {
	drafting.value = true;
	try {
		const d = await resolveDraft();
		const to = props.followUp.toEmail ? encodeURIComponent(props.followUp.toEmail) : '';
		// Encode manually — mail clients want %20 for spaces, not URLSearchParams's `+`.
		window.location.href = `mailto:${to}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
	} finally {
		drafting.value = false;
	}
}

async function send() {
	if (!confirming.value) { confirming.value = true; return; }
	sending.value = true;
	try {
		const d = await resolveDraft();
		const res = await $fetch<{ ok: boolean; held?: boolean; reason?: string }>('/api/followups/send', {
			method: 'POST',
			body: { ...props.followUp, subject: d.subject, body: d.body, orgId: selectedOrg.value },
		});
		if (res?.ok) {
			toast.success(`Follow-up sent to ${props.followUp.toName || props.followUp.toEmail}`);
			emit('sent');
		} else if (res?.held) {
			toast.error('Sending from Earnest is off for this org — use “Draft” to send from your own email instead.');
		} else {
			toast.error(res?.reason || 'Could not send follow-up');
		}
	} catch (err: any) {
		toast.error(err?.data?.message || err?.message || 'Could not send follow-up');
	} finally {
		sending.value = false;
		confirming.value = false;
	}
}
</script>

<template>
	<!-- stop click-through so the buttons don't also trigger the card's navigate -->
	<div class="flex items-center gap-1.5" @click.stop>
		<button
			type="button"
			:disabled="drafting"
			class="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
			@click="draft"
		>
			<EarnestIcon v-if="!drafting" class="w-3 h-3 text-primary" />
			{{ drafting ? 'Drafting…' : 'Draft' }}
		</button>
		<button
			v-if="canSend"
			type="button"
			:disabled="sending"
			class="text-[11px] px-2 py-1 rounded-full transition-colors disabled:opacity-50"
			:class="confirming
				? 'bg-primary text-primary-foreground'
				: 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'"
			@click="send"
		>
			{{ sending ? 'Sending…' : confirming ? 'Confirm send' : 'Send' }}
		</button>
	</div>
</template>
