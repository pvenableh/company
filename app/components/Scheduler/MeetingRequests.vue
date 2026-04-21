<script setup lang="ts">
// date-fns imports removed — using utils/dates.ts

const toast = useToast();
const loading = ref(true);
const requests = ref<any[]>([]);
const processingId = ref<string | null>(null);

const pendingRequests = computed(() => requests.value.filter((r) => r.request_status === 'pending'));
const resolvedRequests = computed(() => requests.value.filter((r) => r.request_status !== 'pending'));

const fetchRequests = async () => {
	loading.value = true;
	try {
		const response = await $fetch('/api/scheduler/meeting-requests');
		requests.value = (response as any).data || [];
	} catch (error) {
		console.error('Error fetching meeting requests:', error);
	} finally {
		loading.value = false;
	}
};

const handleRequest = async (requestId: string, status: 'approved' | 'rejected', adminNotes?: string) => {
	processingId.value = requestId;
	try {
		await $fetch('/api/scheduler/meeting-requests', {
			method: 'PATCH',
			body: { request_id: requestId, request_status: status, admin_notes: adminNotes },
		});
		toast.add({
			title: status === 'approved' ? 'Meeting request approved' : 'Meeting request declined',
			description: status === 'approved' ? 'A meeting has been created and the requester will be notified.' : undefined,
			color: status === 'approved' ? 'green' : 'gray',
		});
		await fetchRequests();
	} catch (error: any) {
		toast.add({ title: 'Error updating request', description: error.message, color: 'red' });
	} finally {
		processingId.value = null;
	}
};

// Uses native formatting for weekday+date display
const formatDate = (dateStr: string) => {
	if (!dateStr) return 'No date specified';
	const d = new Date(dateStr);
	if (isNaN(d.getTime())) return dateStr;
	return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

// Uses formatTimeFromString from utils/dates.ts
const formatTime = (timeStr: string) => formatTimeFromString(timeStr);

const getRequesterName = (request: any) => {
	const r = request.requester_id;
	if (!r) return 'Unknown';
	return typeof r === 'object' ? `${r.first_name || ''} ${r.last_name || ''}`.trim() : r;
};

const { getStatusColorName: getStatusColor } = useStatusStyle();

onMounted(() => fetchRequests());
</script>

<template>
	<div class="space-y-6">
		<!-- Pending Requests -->
		<div>
			<h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
				Pending Requests
				<UBadge v-if="pendingRequests.length" color="yellow" variant="soft" size="xs">
					{{ pendingRequests.length }}
				</UBadge>
			</h3>

			<div v-if="loading" class="flex justify-center py-8">
				<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
			</div>

			<div v-else-if="pendingRequests.length === 0" class="text-center py-8 border-2 border-dashed rounded-lg">
				<UIcon name="i-heroicons-inbox" class="w-10 h-10 text-gray-300 mx-auto mb-2" />
				<p class="text-sm text-gray-500">No pending meeting requests</p>
			</div>

			<div v-else class="space-y-3">
				<UCard v-for="request in pendingRequests" :key="request.id">
					<div class="flex items-start justify-between gap-4">
						<div class="flex items-start gap-3 flex-1">
							<UAvatar
								:alt="getRequesterName(request)"
								:src="request.requester_id?.avatar ? `/api/directus/assets/${request.requester_id.avatar}` : undefined"
								size="sm"
							/>
							<div class="flex-1 min-w-0">
								<p class="font-medium">{{ getRequesterName(request) }}</p>
								<p class="text-sm text-gray-500">{{ request.requester_id?.email }}</p>
								<div class="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-600 dark:text-gray-400">
									<span class="flex items-center gap-1">
										<UIcon name="i-heroicons-calendar" class="w-4 h-4" />
										{{ formatDate(request.requested_date) }}
									</span>
									<span v-if="request.preferred_time" class="flex items-center gap-1">
										<UIcon name="i-heroicons-clock" class="w-4 h-4" />
										{{ formatTime(request.preferred_time) }}
									</span>
									<span v-if="request.duration_minutes" class="flex items-center gap-1">
										{{ request.duration_minutes }} min
									</span>
									<UBadge v-if="request.meeting_type" color="gray" variant="soft" size="xs">
										{{ request.meeting_type }}
									</UBadge>
								</div>
								<p v-if="request.notes" class="mt-2 text-sm text-gray-500 italic">"{{ request.notes }}"</p>
							</div>
						</div>
						<div class="flex items-center gap-2 flex-shrink-0">
							<UButton
								color="green"
								variant="soft"
								size="sm"
								icon="i-heroicons-check"
								:loading="processingId === request.id"
								@click="handleRequest(request.id, 'approved')"
							>
								Approve
							</UButton>
							<UButton
								color="red"
								variant="soft"
								size="sm"
								icon="i-heroicons-x-mark"
								:loading="processingId === request.id"
								@click="handleRequest(request.id, 'rejected')"
							>
								Decline
							</UButton>
						</div>
					</div>
				</UCard>
			</div>
		</div>

		<!-- Resolved Requests -->
		<div v-if="resolvedRequests.length > 0">
			<h3 class="text-lg font-semibold mb-4">Previous Requests</h3>
			<div class="space-y-2">
				<div
					v-for="request in resolvedRequests"
					:key="request.id"
					class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
				>
					<div class="flex items-center gap-3">
						<UAvatar
							:alt="getRequesterName(request)"
							:src="request.requester_id?.avatar ? `/api/directus/assets/${request.requester_id.avatar}` : undefined"
							size="xs"
						/>
						<div>
							<p class="text-sm font-medium">{{ getRequesterName(request) }}</p>
							<p class="text-xs text-gray-500">{{ formatDate(request.requested_date) }}</p>
						</div>
					</div>
					<UBadge :color="getStatusColor(request.request_status)" variant="soft" size="xs" class="capitalize">
						{{ request.request_status }}
					</UBadge>
				</div>
			</div>
		</div>
	</div>
</template>
