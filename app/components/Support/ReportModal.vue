<script setup lang="ts">
/**
 * Support/ReportModal — global "Report a bug / Send feedback" form.
 *
 * Mounted once in app.vue; opened from anywhere via useReportIssue():
 *
 *   const { openReportModal } = useReportIssue();
 *   openReportModal('bug');
 *
 * Submits to /api/support/submit which routes the ticket into the
 * Earnest Support organization (see scripts/setup-earnest-support-org.ts).
 */

import type { SupportType } from '~/composables/useReportIssue';

const { state, closeReportModal } = useReportIssue();
const toast = useToast();
const route = useRoute();

const isOpen = computed({
	get: () => state.value.open,
	set: (v) => {
		if (!v) closeReportModal();
	},
});

const TYPE_OPTIONS: Array<{ value: SupportType; label: string; icon: string; hint: string }> = [
	{ value: 'bug', label: 'Bug', icon: 'lucide:bug', hint: 'Something is broken or wrong' },
	{ value: 'feature', label: 'Feature', icon: 'lucide:sparkles', hint: 'Idea or request' },
	{ value: 'question', label: 'Question', icon: 'lucide:circle-help', hint: "I'm stuck or unsure" },
	{ value: 'feedback', label: 'Feedback', icon: 'lucide:message-circle', hint: 'General thoughts' },
];

const PRIORITY_OPTIONS = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
];

const form = ref({
	type: 'bug' as SupportType,
	title: '',
	description: '',
	priority: 'medium' as 'low' | 'medium' | 'high',
});

const submitting = ref(false);

watch(
	() => state.value.open,
	(open) => {
		if (open) {
			form.value = {
				type: state.value.type,
				title: '',
				description: '',
				priority: state.value.type === 'bug' ? 'medium' : 'low',
			};
		}
	},
);

const placeholderByType: Record<SupportType, { title: string; body: string }> = {
	bug: {
		title: "Login button stuck on spinner after Google sign-in",
		body: 'What happened?\nWhat did you expect to happen?\nSteps to reproduce, if you can repeat it.',
	},
	feature: {
		title: 'Add bulk-archive to contacts',
		body: 'What problem would this solve? Who else would benefit?',
	},
	question: {
		title: 'How do I share a project view with a client?',
		body: 'What are you trying to do? What have you tried already?',
	},
	feedback: {
		title: 'The new contacts page feels really clean',
		body: 'Anything specific that worked or fell flat?',
	},
};

const canSubmit = computed(() => form.value.title.trim().length > 0 && !submitting.value);

async function submit() {
	if (!canSubmit.value) return;
	submitting.value = true;
	try {
		const viewport =
			typeof window !== 'undefined'
				? { width: window.innerWidth, height: window.innerHeight }
				: undefined;
		await $fetch('/api/support/submit', {
			method: 'POST',
			body: {
				type: form.value.type,
				title: form.value.title.trim(),
				description: form.value.description.trim(),
				priority: form.value.priority,
				url: typeof window !== 'undefined' ? window.location.href : route.fullPath,
				viewport,
				userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
			},
		});
		toast.success("Thanks — we'll follow up.", {
			description: 'Your report landed in our inbox.',
		});
		closeReportModal();
	} catch (err: any) {
		toast.error('Could not send your report', {
			description: err?.data?.message || err?.message || 'Please try again in a moment.',
		});
	} finally {
		submitting.value = false;
	}
}
</script>

<template>
	<UModal v-model="isOpen" title="Send feedback to Earnest">
		<form class="space-y-4" @submit.prevent="submit">
			<div>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
					Type
				</p>
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
					<button
						v-for="opt in TYPE_OPTIONS"
						:key="opt.value"
						type="button"
						class="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border text-xs transition-colors"
						:class="
							form.type === opt.value
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-border/40 text-muted-foreground hover:bg-muted/40'
						"
						@click="form.type = opt.value"
					>
						<UIcon :name="opt.icon" class="w-4 h-4" />
						<span class="font-medium">{{ opt.label }}</span>
					</button>
				</div>
				<p class="text-[11px] text-muted-foreground mt-1.5">
					{{ TYPE_OPTIONS.find((o) => o.value === form.type)?.hint }}
				</p>
			</div>

			<UFormGroup label="Title" required>
				<UInput
					v-model="form.title"
					:placeholder="placeholderByType[form.type].title"
					maxlength="200"
					autofocus
				/>
			</UFormGroup>

			<UFormGroup label="Details">
				<UTextarea
					v-model="form.description"
					:placeholder="placeholderByType[form.type].body"
					:rows="5"
				/>
			</UFormGroup>

			<UFormGroup v-if="form.type === 'bug'" label="Severity">
				<USelect
					v-model="form.priority"
					:options="PRIORITY_OPTIONS"
					option-attribute="label"
					value-attribute="value"
				/>
			</UFormGroup>

			<p class="text-[11px] text-muted-foreground border-t border-border/40 pt-3 leading-relaxed">
				We attach your page URL, browser, and screen size so we can reproduce
				issues faster. No screenshots or form data is captured.
			</p>
		</form>

		<template #footer>
			<div class="flex justify-end">
				<UiActionButton
					icon="lucide:send"
					variant="primary"
					:loading="submitting"
					:disabled="!canSubmit"
					@click="submit"
				>
					Send
				</UiActionButton>
			</div>
		</template>
	</UModal>
</template>
