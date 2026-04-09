<script setup>
definePageMeta({ layout: 'blank' });

const route = useRoute();
const token = route.params.token;

const eventData = ref(null);
const loading = ref(true);
const error = ref(null);
const submitting = ref(false);
const submitted = ref(false);
const submittedAction = ref('');
const showChangesForm = ref(false);
const changesComment = ref('');

async function loadEvent() {
	loading.value = true;
	try {
		eventData.value = await $fetch(`/api/projects/approval/${token}`);
	} catch (err) {
		error.value = err?.data?.message || 'This approval link is invalid or has expired.';
	} finally {
		loading.value = false;
	}
}

async function handleApprove() {
	submitting.value = true;
	try {
		const result = await $fetch('/api/projects/approve', {
			method: 'POST',
			body: { token, action: 'approve' },
		});
		submitted.value = true;
		submittedAction.value = result.alreadyApproved ? 'already_approved' : 'approved';
	} catch (err) {
		error.value = err?.data?.message || 'Failed to submit approval.';
	} finally {
		submitting.value = false;
	}
}

async function handleRequestChanges() {
	submitting.value = true;
	try {
		await $fetch('/api/projects/approve', {
			method: 'POST',
			body: { token, action: 'request_changes', comment: changesComment.value },
		});
		submitted.value = true;
		submittedAction.value = 'changes_requested';
	} catch (err) {
		error.value = err?.data?.message || 'Failed to submit feedback.';
	} finally {
		submitting.value = false;
	}
}

const typeConfig = {
	General: { icon: 'i-heroicons-flag', color: 'text-gray-500', bg: 'bg-gray-500/10' },
	Design: { icon: 'i-heroicons-paint-brush', color: 'text-blue-500', bg: 'bg-blue-500/10' },
	Content: { icon: 'i-heroicons-document-text', color: 'text-purple-500', bg: 'bg-purple-500/10' },
	Timeline: { icon: 'i-heroicons-calendar', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
	Financial: { icon: 'i-heroicons-banknotes', color: 'text-green-500', bg: 'bg-green-500/10' },
	Hours: { icon: 'i-heroicons-clock', color: 'text-amber-500', bg: 'bg-amber-500/10' },
};

const typeInfo = computed(() => typeConfig[eventData.value?.type] || typeConfig.General);

onMounted(loadEvent);
</script>

<template>
	<div class="min-h-screen bg-background flex items-center justify-center p-4">
		<div class="w-full max-w-lg">
			<!-- Loading -->
			<div v-if="loading" class="flex flex-col items-center justify-center py-20">
				<div class="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary mb-4" />
				<p class="text-sm text-muted-foreground">Loading approval details...</p>
			</div>

			<!-- Error -->
			<div v-else-if="error && !eventData" class="text-center py-20">
				<div class="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
					<UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6 text-red-500" />
				</div>
				<h2 class="text-lg font-semibold text-foreground mb-1">Link Invalid</h2>
				<p class="text-sm text-muted-foreground">{{ error }}</p>
			</div>

			<!-- Success -->
			<div v-else-if="submitted" class="text-center py-20">
				<div class="h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-4"
					:class="submittedAction === 'changes_requested' ? 'bg-amber-500/10' : 'bg-green-500/10'"
				>
					<UIcon
						:name="submittedAction === 'changes_requested' ? 'i-heroicons-chat-bubble-left-right' : 'i-heroicons-check-circle'"
						class="w-6 h-6"
						:class="submittedAction === 'changes_requested' ? 'text-amber-500' : 'text-green-500'"
					/>
				</div>
				<h2 class="text-lg font-semibold text-foreground mb-1">
					{{ submittedAction === 'approved' ? 'Approved!' : submittedAction === 'already_approved' ? 'Already Approved' : 'Feedback Sent' }}
				</h2>
				<p class="text-sm text-muted-foreground">
					{{ submittedAction === 'approved'
						? `"${eventData?.title}" has been approved. Thank you!`
						: submittedAction === 'already_approved'
						? 'This event was already approved.'
						: 'Your change request has been submitted. The team will review it.'
					}}
				</p>
			</div>

			<!-- Event Details + Approval Actions -->
			<div v-else-if="eventData" class="space-y-4">
				<!-- Branding header -->
				<div class="text-center mb-6">
					<LogoEarnest size="sm" class="mx-auto" />
					<p class="text-xs text-muted-foreground mt-1">
						{{ eventData.project?.client?.name || eventData.project?.organization?.name || '' }}
					</p>
				</div>

				<!-- Already approved -->
				<div v-if="eventData.approval === 'Approved'" class="ios-card p-6 text-center">
					<div class="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
						<UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-500" />
					</div>
					<h2 class="text-sm font-semibold text-foreground">Already Approved</h2>
					<p v-if="eventData.approved_at" class="text-xs text-muted-foreground mt-1">
						Approved {{ getFriendlyDate(eventData.approved_at) }}
					</p>
				</div>

				<!-- Event card -->
				<div class="ios-card p-6">
					<div class="flex items-start gap-3 mb-4">
						<div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" :class="typeInfo.bg">
							<UIcon :name="typeInfo.icon" class="w-4 h-4" :class="typeInfo.color" />
						</div>
						<div>
							<h2 class="text-base font-semibold text-foreground">{{ eventData.title }}</h2>
							<p class="text-xs text-muted-foreground">
								{{ eventData.project?.title }}
								<span v-if="eventData.event_date"> &middot; {{ getFriendlyDateTwo(eventData.event_date) }}</span>
								<span v-if="eventData.end_date"> - {{ getFriendlyDateTwo(eventData.end_date) }}</span>
							</p>
						</div>
					</div>

					<!-- Description -->
					<div v-if="eventData.description" class="text-sm text-muted-foreground mb-4 leading-relaxed">
						{{ eventData.description }}
					</div>

					<!-- HTML Content -->
					<div v-if="eventData.content" class="prose prose-sm dark:prose-invert max-w-none mb-4 rounded-xl bg-muted/20 p-4 border border-border/30" v-html="eventData.content" />

					<!-- Prototype Link (Figma, etc.) -->
					<div v-if="eventData.prototype_link" class="mb-4">
						<a
							:href="eventData.prototype_link"
							target="_blank"
							class="ios-card p-3 flex items-center gap-3 ios-press block hover:shadow-md transition-shadow"
						>
							<div class="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
								<UIcon name="i-heroicons-cursor-arrow-ripple" class="w-4 h-4 text-purple-500" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-foreground">View Prototype</p>
								<p class="text-[10px] text-muted-foreground truncate">{{ eventData.prototype_link }}</p>
							</div>
							<UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4 text-muted-foreground" />
						</a>
					</div>

					<!-- External Link -->
					<div v-if="eventData.link && eventData.link !== eventData.prototype_link" class="mb-4">
						<a
							:href="eventData.link"
							target="_blank"
							class="ios-card p-3 flex items-center gap-3 ios-press block hover:shadow-md transition-shadow"
						>
							<div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
								<UIcon name="i-heroicons-link" class="w-4 h-4 text-blue-500" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium text-foreground">View Link</p>
								<p class="text-[10px] text-muted-foreground truncate">{{ eventData.link }}</p>
							</div>
							<UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4 text-muted-foreground" />
						</a>
					</div>
				</div>

				<!-- Approval Actions -->
				<div v-if="eventData.approval !== 'Approved'" class="space-y-3">
					<!-- Request Changes Form -->
					<div v-if="showChangesForm" class="ios-card p-4">
						<h3 class="text-sm font-medium mb-2">Request Changes</h3>
						<textarea
							v-model="changesComment"
							placeholder="Describe the changes you'd like..."
							rows="3"
							class="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
						/>
						<div class="flex items-center gap-2 mt-3">
							<UButton
								color="amber"
								variant="soft"
								size="sm"
								@click="handleRequestChanges"
								:loading="submitting"
								:disabled="!changesComment.trim()"
							>
								Submit Feedback
							</UButton>
							<UButton color="gray" variant="ghost" size="sm" @click="showChangesForm = false">
								Cancel
							</UButton>
						</div>
					</div>

					<!-- Action buttons -->
					<div v-else class="flex flex-col gap-2">
						<button
							class="w-full py-3 rounded-xl bg-green-500 text-white font-medium text-sm hover:bg-green-600 transition-colors flex items-center justify-center gap-2 ios-press"
							:disabled="submitting"
							@click="handleApprove"
						>
							<UIcon v-if="submitting" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
							<UIcon v-else name="i-heroicons-check" class="w-4 h-4" />
							Approve
						</button>
						<button
							class="w-full py-3 rounded-xl border border-border text-foreground font-medium text-sm hover:bg-muted/50 transition-colors flex items-center justify-center gap-2"
							@click="showChangesForm = true"
						>
							<UIcon name="i-heroicons-chat-bubble-left-right" class="w-4 h-4" />
							Request Changes
						</button>
					</div>
				</div>

				<!-- Footer -->
				<p class="text-center text-[10px] text-muted-foreground/50 mt-6">
					Powered by Earnest
				</p>
			</div>
		</div>
	</div>
</template>
