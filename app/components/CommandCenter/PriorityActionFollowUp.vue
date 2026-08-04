<!--
  PriorityActionFollowUp — inline client follow-up quick-action for priority
  cards backed by a cold proposal or an overdue lead.

  · "Draft"  → opens the user's own mail client (mailto:) prefilled with an
    Earnest-suggested subject/body to the client contact. Zero backend; the user
    reviews and hits send themselves.
  · "Send"   → sends a branded follow-up to the client from Earnest via
    /api/followups/send (two-tap confirm). Only shown when we have the contact's
    email. If the org isn't on the outbound allow-list the API returns held=true
    and we point the user back to "Draft".
-->
<script setup lang="ts">
import { toast } from 'vue-sonner';

interface FollowUp {
	toEmail: string | null;
	toName: string | null;
	subject: string;
	body: string;
	kind: 'proposal' | 'lead';
	refId: string;
}

const props = defineProps<{ followUp: FollowUp }>();
const emit = defineEmits<{ (e: 'sent'): void }>();

const { selectedOrg } = useOrganization();
const sending = ref(false);
const confirming = ref(false);

function draft() {
	const f = props.followUp;
	const to = f.toEmail ? encodeURIComponent(f.toEmail) : '';
	// Encode manually — mail clients want %20 for spaces, not URLSearchParams's `+`.
	const qs = `subject=${encodeURIComponent(f.subject)}&body=${encodeURIComponent(f.body)}`;
	window.location.href = `mailto:${to}?${qs}`;
}

async function send() {
	// First click arms the confirm; second click sends.
	if (!confirming.value) { confirming.value = true; return; }
	sending.value = true;
	try {
		const res = await $fetch<{ ok: boolean; held?: boolean; reason?: string }>('/api/followups/send', {
			method: 'POST',
			body: { ...props.followUp, orgId: selectedOrg.value },
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
			class="text-[11px] px-2 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
			@click="draft"
		>
			Draft
		</button>
		<button
			v-if="followUp.toEmail"
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
