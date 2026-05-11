<!--
  SchedulerSendInvitePopover

  Resend (or send for the first time) a scheduled video meeting's invite to a
  single recipient via email and/or SMS. The original VideoMeetings.vue list had
  this as a tabbed modal; consolidating it here so both UnifiedEventModal (edit
  mode) and the day-timeline hover-action group can hand the same affordance to
  hosts after a meeting already exists.

  Two render modes:
    - Default: popover with a slot-trigger. Used by DayTimeline (hover icon).
    - `inline`: render the form directly (no popover wrapper, no trigger
      slot). Used inside UnifiedEventModal so the form sits in the modal body
      instead of floating outside it as a separate popover.
-->
<script setup lang="ts">
interface MeetingProp {
	id: string;
	room_name?: string | null;
	title?: string | null;
	scheduled_start?: string | null;
	scheduled_end?: string | null;
	host_name?: string | null;
	invitee_name?: string | null;
	invitee_email?: string | null;
	invitee_phone?: string | null;
}

const props = defineProps<{
	meeting: MeetingProp;
	inline?: boolean;
	// Inline mode: parent controls whether the form is shown.
	modelValue?: boolean;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: boolean];
	'sent': [];
}>();

const toast = useToast();

// `open` drives the popover; in inline mode we sync from modelValue.
const open = ref(false);
const isOpen = computed({
	get: () => (props.inline ? !!props.modelValue : open.value),
	set: (v) => {
		if (props.inline) emit('update:modelValue', v);
		else open.value = v;
	},
});
const sending = ref(false);

const form = reactive({
	name: '',
	email: '',
	phone: '',
	method: 'email' as 'email' | 'sms' | 'both',
	customMessage: '',
});

const methodOptions = [
	{ label: 'Email', value: 'email' },
	{ label: 'SMS', value: 'sms' },
	{ label: 'Both', value: 'both' },
];

watch(isOpen, (next) => {
	if (!next) return;
	form.name = props.meeting.invitee_name || '';
	form.email = props.meeting.invitee_email || '';
	form.phone = props.meeting.invitee_phone || '';
	const hasEmail = !!form.email;
	const hasPhone = !!form.phone;
	form.method = hasEmail && hasPhone ? 'email' : hasPhone && !hasEmail ? 'sms' : 'email';
	form.customMessage = '';
});

const close = () => { isOpen.value = false; };

const send = async () => {
	const wantsEmail = form.method === 'email' || form.method === 'both';
	const wantsSms = form.method === 'sms' || form.method === 'both';
	if (wantsEmail && !form.email.trim()) {
		toast.add({ title: 'Email required', color: 'red' });
		return;
	}
	if (wantsSms && !form.phone.trim()) {
		toast.add({ title: 'Phone required', color: 'red' });
		return;
	}

	sending.value = true;

	const tasks: Promise<any>[] = [];
	if (wantsEmail) {
		tasks.push(
			$fetch('/api/video/send-email-invite', {
				method: 'POST',
				body: {
					roomName: props.meeting.room_name,
					meetingId: props.meeting.id,
					toEmail: form.email.trim(),
					toName: form.name.trim() || null,
					customMessage: form.customMessage.trim() || null,
					scheduledStart: props.meeting.scheduled_start,
					scheduledEnd: props.meeting.scheduled_end,
					hostName: props.meeting.host_name || null,
				},
			}),
		);
	}
	if (wantsSms) {
		tasks.push(
			$fetch('/api/video/send-invite', {
				method: 'POST',
				body: {
					roomName: props.meeting.room_name,
					phoneNumber: form.phone.trim(),
					customMessage: form.customMessage.trim() || null,
				},
			}),
		);
	}

	try {
		const results = await Promise.allSettled(tasks);
		const failures = results.filter((r) => r.status === 'rejected');
		if (failures.length === results.length) {
			throw new Error((failures[0] as PromiseRejectedResult).reason?.message || 'Send failed');
		}
		const label = form.method === 'both'
			? failures.length > 0 ? 'Sent partially' : 'Invite sent (email + SMS)'
			: form.method === 'email' ? 'Email sent' : 'SMS sent';
		toast.add({ title: label, color: failures.length > 0 ? 'amber' : 'green' });
		emit('sent');
		close();
	} catch (error: any) {
		toast.add({ title: 'Send failed', description: error.message, color: 'red' });
	} finally {
		sending.value = false;
	}
};
</script>

<template>
	<!-- Inline body: collapsed unless modelValue is true. Keeps the form inside
	     the parent's container so spacing stays predictable. -->
	<div v-if="inline" v-show="isOpen" class="rounded-xl bg-muted/15 border border-border/40 p-3 space-y-3">
		<div class="flex items-center justify-between">
			<span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
				Send Invite
			</span>
			<button
				type="button"
				@click="close"
				class="p-0.5 rounded hover:bg-muted/40 transition-colors text-muted-foreground"
			>
				<UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
			</button>
		</div>

		<div class="space-y-2.5">
			<UFormGroup label="Name">
				<UInput v-model="form.name" placeholder="Recipient name" size="sm" />
			</UFormGroup>
			<UFormGroup label="Email">
				<UInput v-model="form.email" type="email" placeholder="guest@example.com" size="sm" />
			</UFormGroup>
			<UFormGroup label="Phone">
				<UInput v-model="form.phone" type="tel" placeholder="+1 (555) 000-0000" size="sm" />
			</UFormGroup>
			<UFormGroup label="Send via">
				<USelect v-model="form.method" :options="methodOptions" size="sm" />
			</UFormGroup>
			<UFormGroup label="Message (optional)">
				<UTextarea v-model="form.customMessage" rows="2" size="sm" placeholder="Add a personal note..." />
			</UFormGroup>
		</div>

		<div class="flex justify-end gap-2">
			<button
				type="button"
				:disabled="sending"
				@click="send"
				class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold transition-colors ios-press disabled:opacity-50"
			>
				<UIcon v-if="sending" name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
				<UIcon v-else name="i-heroicons-paper-airplane" class="w-3.5 h-3.5" />
				{{ sending ? 'Sending…' : 'Send' }}
			</button>
		</div>
	</div>

	<!-- Popover mode: trigger via slot, content floats. Used by DayTimeline. -->
	<UPopover
		v-else
		v-model:open="open"
		:popper="{ placement: 'bottom-end', offsetDistance: 6 }"
	>
		<slot />

		<template #content>
			<div class="w-80 p-4 space-y-3">
				<div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
					Send Invite
				</div>

				<div class="space-y-2.5">
					<UFormGroup label="Name">
						<UInput v-model="form.name" placeholder="Recipient name" size="sm" />
					</UFormGroup>
					<UFormGroup label="Email">
						<UInput v-model="form.email" type="email" placeholder="guest@example.com" size="sm" />
					</UFormGroup>
					<UFormGroup label="Phone">
						<UInput v-model="form.phone" type="tel" placeholder="+1 (555) 000-0000" size="sm" />
					</UFormGroup>
					<UFormGroup label="Send via">
						<USelect v-model="form.method" :options="methodOptions" size="sm" />
					</UFormGroup>
					<UFormGroup label="Message (optional)">
						<UTextarea v-model="form.customMessage" rows="2" size="sm" placeholder="Add a personal note..." />
					</UFormGroup>
				</div>

				<div class="flex justify-end gap-2 pt-1">
					<button
						type="button"
						@click="close"
						class="px-3 py-1.5 rounded-lg text-[12px] font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						:disabled="sending"
						@click="send"
						class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold transition-colors ios-press disabled:opacity-50"
					>
						<UIcon v-if="sending" name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
						<UIcon v-else name="i-heroicons-paper-airplane" class="w-3.5 h-3.5" />
						{{ sending ? 'Sending…' : 'Send' }}
					</button>
				</div>
			</div>
		</template>
	</UPopover>
</template>
