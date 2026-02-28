<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });

const { user } = useDirectusAuth();
const { hasAdminAccess } = useTeams();
const isAdmin = computed(() => hasAdminAccess(user.value));
const phoneItems = useDirectusItems('phone_settings');
const businessHourItems = useDirectusItems('business_hours');
const callRouteItems = useDirectusItems('call_routes');
const toast = useToast();

const loading = ref(true);
const saving = ref(false);
const phoneLines = ref<any[]>([]);
const selectedLineId = ref<string | null>(null);
const showCreateLine = ref(false);

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const TIMEZONE_OPTIONS = [
	{ label: 'Eastern (New York)', value: 'America/New_York' },
	{ label: 'Central (Chicago)', value: 'America/Chicago' },
	{ label: 'Mountain (Denver)', value: 'America/Denver' },
	{ label: 'Arizona (Phoenix)', value: 'America/Phoenix' },
	{ label: 'Pacific (Los Angeles)', value: 'America/Los_Angeles' },
];

const VOICE_OPTIONS = [
	{ label: 'Joanna (Neural)', value: 'Polly.Joanna-Neural' },
	{ label: 'Matthew (Neural)', value: 'Polly.Matthew-Neural' },
	{ label: 'Ruth (Neural)', value: 'Polly.Ruth-Neural' },
	{ label: 'Stephen (Neural)', value: 'Polly.Stephen-Neural' },
	{ label: 'Salli (Neural)', value: 'Polly.Salli-Neural' },
	{ label: 'Joey (Neural)', value: 'Polly.Joey-Neural' },
	{ label: 'Kendra (Neural)', value: 'Polly.Kendra-Neural' },
	{ label: 'Kimberly (Neural)', value: 'Polly.Kimberly-Neural' },
	{ label: 'Google Female', value: 'Google.en-US-Wavenet-F' },
	{ label: 'Google Male', value: 'Google.en-US-Wavenet-D' },
	{ label: 'Alice (Classic)', value: 'alice' },
	{ label: 'Man (Classic)', value: 'man' },
	{ label: 'Woman (Classic)', value: 'woman' },
];

// Form state for creating/editing a line
const lineForm = reactive({
	line_name: '',
	line_identifier: '',
	twilio_phone_number: '',
	company_name: '',
	greeting_text: '',
	business_hours_enabled: false,
	timezone: 'America/New_York',
	after_hours_message: '',
	active: true,
	voice: 'Polly.Joanna-Neural',
});

const businessHours = ref<Record<string, { is_open: boolean; open_time: string; close_time: string; id?: number }>>({});
const callRoutes = ref<any[]>([]);
const newRoute = reactive({ department: '', menu_key: '', phone_number: '' });

// Initialize business hours defaults
function initBusinessHours() {
	const defaults: typeof businessHours.value = {};
	for (const day of DAYS) {
		defaults[day] = {
			is_open: !['saturday', 'sunday'].includes(day),
			open_time: '09:00',
			close_time: '17:00',
		};
	}
	businessHours.value = defaults;
}

const selectedLine = computed(() => phoneLines.value.find((l) => l.id === selectedLineId.value));

async function fetchPhoneLines() {
	loading.value = true;
	try {
		const result = await phoneItems.list({
			fields: ['*', 'business_hours.*', 'call_routes.*'],
			sort: ['sort', 'line_name'],
		});
		phoneLines.value = result || [];
		if (phoneLines.value.length && !selectedLineId.value) {
			selectLine(phoneLines.value[0].id);
		}
	} catch (err: any) {
		console.error('Error fetching phone settings:', err);
		toast.add({ title: 'Error loading phone settings', description: err.message, color: 'red' });
	} finally {
		loading.value = false;
	}
}

function selectLine(lineId: string) {
	selectedLineId.value = lineId;
	const line = phoneLines.value.find((l) => l.id === lineId);
	if (!line) return;

	// Populate form
	lineForm.line_name = line.line_name || '';
	lineForm.line_identifier = line.line_identifier || '';
	lineForm.twilio_phone_number = line.twilio_phone_number || '';
	lineForm.company_name = line.company_name || '';
	lineForm.greeting_text = line.greeting_text || '';
	lineForm.business_hours_enabled = line.business_hours_enabled || false;
	lineForm.timezone = line.timezone || 'America/New_York';
	lineForm.after_hours_message = line.after_hours_message || '';
	lineForm.active = line.active ?? true;
	lineForm.voice = line.voice || 'Polly.Joanna-Neural';

	// Populate business hours
	initBusinessHours();
	if (line.business_hours?.length) {
		for (const bh of line.business_hours) {
			if (bh.day_of_week && businessHours.value[bh.day_of_week]) {
				businessHours.value[bh.day_of_week] = {
					id: bh.id,
					is_open: bh.is_open ?? false,
					open_time: bh.open_time || '09:00',
					close_time: bh.close_time || '17:00',
				};
			}
		}
	}

	// Populate call routes
	callRoutes.value = (line.call_routes || []).filter((r: any) => typeof r === 'object');
}

async function saveLine() {
	if (!selectedLineId.value) return;
	saving.value = true;
	try {
		await phoneItems.update(selectedLineId.value, {
			line_name: lineForm.line_name,
			line_identifier: lineForm.line_identifier,
			twilio_phone_number: lineForm.twilio_phone_number,
			company_name: lineForm.company_name,
			greeting_text: lineForm.greeting_text,
			business_hours_enabled: lineForm.business_hours_enabled,
			timezone: lineForm.timezone,
			after_hours_message: lineForm.after_hours_message,
			active: lineForm.active,
			voice: lineForm.voice,
		});

		// Save business hours
		for (const day of DAYS) {
			const bh = businessHours.value[day];
			if (bh?.id) {
				await businessHourItems.update(bh.id, {
					is_open: bh.is_open,
					open_time: bh.open_time,
					close_time: bh.close_time,
				});
			} else {
				await businessHourItems.create({
					phone_settings_id: selectedLineId.value,
					day_of_week: day,
					is_open: bh.is_open,
					open_time: bh.open_time,
					close_time: bh.close_time,
					status: 'published',
				});
			}
		}

		toast.add({ title: 'Phone settings saved', color: 'green' });
		await fetchPhoneLines();
	} catch (err: any) {
		console.error('Error saving phone settings:', err);
		toast.add({ title: 'Error saving settings', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function createLine() {
	if (!lineForm.line_name || !lineForm.company_name) {
		toast.add({ title: 'Line name and company name are required', color: 'red' });
		return;
	}
	saving.value = true;
	try {
		const created = await phoneItems.create({
			line_name: lineForm.line_name,
			line_identifier: lineForm.line_identifier || slugify(lineForm.line_name),
			company_name: lineForm.company_name,
			twilio_phone_number: lineForm.twilio_phone_number,
			active: true,
			status: 'published',
			voice: 'Polly.Joanna-Neural',
			timezone: 'America/New_York',
		});
		toast.add({ title: 'Phone line created', color: 'green' });
		showCreateLine.value = false;
		await fetchPhoneLines();
		if (created?.id) selectLine(created.id);
	} catch (err: any) {
		console.error('Error creating phone line:', err);
		toast.add({ title: 'Error creating line', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function addCallRoute() {
	if (!newRoute.department || !newRoute.menu_key || !newRoute.phone_number || !selectedLineId.value) return;
	try {
		await callRouteItems.create({
			phone_settings_id: selectedLineId.value,
			department: newRoute.department,
			menu_key: newRoute.menu_key,
			phone_number: newRoute.phone_number,
			active: true,
			status: 'published',
		});
		newRoute.department = '';
		newRoute.menu_key = '';
		newRoute.phone_number = '';
		toast.add({ title: 'Route added', color: 'green' });
		await fetchPhoneLines();
		selectLine(selectedLineId.value);
	} catch (err: any) {
		toast.add({ title: 'Error adding route', description: err.message, color: 'red' });
	}
}

async function removeCallRoute(routeId: string) {
	try {
		await callRouteItems.remove(routeId);
		toast.add({ title: 'Route removed', color: 'green' });
		await fetchPhoneLines();
		if (selectedLineId.value) selectLine(selectedLineId.value);
	} catch (err: any) {
		toast.add({ title: 'Error removing route', description: err.message, color: 'red' });
	}
}

onMounted(() => {
	initBusinessHours();
	fetchPhoneLines();
});
</script>

<template>
	<div class="page__content">
		<h1 class="page__title">
			Phone System
			<span class="block">Settings</span>
		</h1>

		<div v-if="!isAdmin" class="flex flex-col items-center justify-center z-10 min-h-[60vh] page__inner">
			<h2 class="text-2xl font-proxima-light uppercase tracking-widest text-gray-400">Admin Only</h2>
			<p class="text-sm text-gray-400 mt-2">You need admin access to manage phone settings.</p>
		</div>

		<div v-else class="max-w-5xl mx-auto px-4 py-6">
			<!-- Loading -->
			<div v-if="loading" class="flex items-center justify-center min-h-[300px]">
				<div class="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
			</div>

			<template v-else>
				<!-- Line Selector -->
				<div class="flex items-center justify-between mb-6">
					<div class="flex items-center gap-3">
						<USelect
							v-if="phoneLines.length"
							:model-value="selectedLineId"
							@update:model-value="selectLine"
							:options="phoneLines.map((l) => ({ label: `${l.line_name} ${l.active ? '' : '(Inactive)'}`, value: l.id }))"
							placeholder="Select a phone line"
						/>
						<UBadge v-if="selectedLine?.active" color="green" variant="soft">Active</UBadge>
						<UBadge v-else-if="selectedLine" color="gray" variant="soft">Inactive</UBadge>
					</div>
					<UButton icon="i-heroicons-plus" size="sm" @click="showCreateLine = true">
						New Line
					</UButton>
				</div>

				<!-- Create Line Modal -->
				<UModal v-model="showCreateLine">
					<div class="p-6 space-y-4">
						<h3 class="text-lg font-semibold">Create Phone Line</h3>
						<UFormGroup label="Line Name" required>
							<UInput v-model="lineForm.line_name" placeholder="e.g. Main Office" />
						</UFormGroup>
						<UFormGroup label="Company Name" required>
							<UInput v-model="lineForm.company_name" placeholder="Your company name" />
						</UFormGroup>
						<UFormGroup label="Twilio Phone Number">
							<UInput v-model="lineForm.twilio_phone_number" placeholder="+15551234567" />
						</UFormGroup>
						<div class="flex justify-end gap-2">
							<UButton color="gray" variant="soft" @click="showCreateLine = false">Cancel</UButton>
							<UButton :loading="saving" @click="createLine">Create Line</UButton>
						</div>
					</div>
				</UModal>

				<!-- No Lines -->
				<div v-if="phoneLines.length === 0" class="text-center py-12 border-2 border-dashed rounded-lg">
					<UIcon name="i-heroicons-phone" class="w-12 h-12 text-gray-300 mx-auto mb-3" />
					<h3 class="text-lg font-medium text-gray-600">No Phone Lines Configured</h3>
					<p class="text-sm text-gray-400 mt-1 mb-4">Create your first phone line to get started.</p>
					<UButton icon="i-heroicons-plus" @click="showCreateLine = true">Create Phone Line</UButton>
				</div>

				<!-- Line Settings -->
				<div v-else-if="selectedLine" class="space-y-8">
					<!-- General Settings -->
					<UCard>
						<template #header>
							<h3 class="font-semibold text-sm uppercase tracking-wider">General Settings</h3>
						</template>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<UFormGroup label="Line Name" required>
								<UInput v-model="lineForm.line_name" />
							</UFormGroup>
							<UFormGroup label="Line Identifier">
								<UInput v-model="lineForm.line_identifier" placeholder="e.g. main, support" />
							</UFormGroup>
							<UFormGroup label="Company Name" required>
								<UInput v-model="lineForm.company_name" />
							</UFormGroup>
							<UFormGroup label="Twilio Phone Number">
								<UInput v-model="lineForm.twilio_phone_number" placeholder="+15551234567" />
							</UFormGroup>
							<UFormGroup label="TTS Voice">
								<USelect v-model="lineForm.voice" :options="VOICE_OPTIONS" />
							</UFormGroup>
							<UFormGroup label="Timezone">
								<USelect v-model="lineForm.timezone" :options="TIMEZONE_OPTIONS" />
							</UFormGroup>
						</div>
						<div class="flex items-center gap-4 mt-4">
							<label class="flex items-center gap-2 text-sm">
								<input type="checkbox" v-model="lineForm.active" class="rounded" />
								Line Active
							</label>
						</div>
					</UCard>

					<!-- Greeting -->
					<UCard>
						<template #header>
							<h3 class="font-semibold text-sm uppercase tracking-wider">Greeting Message</h3>
						</template>
						<UFormGroup label="Greeting Text">
							<UTextarea v-model="lineForm.greeting_text" placeholder="Welcome to our company. Please listen to the following options..." rows="3" />
						</UFormGroup>
					</UCard>

					<!-- Business Hours -->
					<UCard>
						<template #header>
							<div class="flex items-center justify-between">
								<h3 class="font-semibold text-sm uppercase tracking-wider">Business Hours</h3>
								<label class="flex items-center gap-2 text-sm">
									<input type="checkbox" v-model="lineForm.business_hours_enabled" class="rounded" />
									Enable Business Hours
								</label>
							</div>
						</template>
						<div v-if="lineForm.business_hours_enabled" class="space-y-3">
							<div v-for="day in DAYS" :key="day" class="flex items-center gap-4">
								<label class="w-28 flex items-center gap-2 text-sm capitalize">
									<input type="checkbox" v-model="businessHours[day].is_open" class="rounded" />
									{{ day }}
								</label>
								<template v-if="businessHours[day].is_open">
									<UInput v-model="businessHours[day].open_time" type="time" size="sm" class="w-32" />
									<span class="text-gray-400">to</span>
									<UInput v-model="businessHours[day].close_time" type="time" size="sm" class="w-32" />
								</template>
								<span v-else class="text-sm text-gray-400">Closed</span>
							</div>

							<UFormGroup label="After Hours Message" class="mt-4">
								<UTextarea v-model="lineForm.after_hours_message" placeholder="We are currently closed. Please call back during business hours." rows="2" />
							</UFormGroup>
						</div>
						<p v-else class="text-sm text-gray-500">Enable business hours to configure operating schedule.</p>
					</UCard>

					<!-- Call Routing -->
					<UCard>
						<template #header>
							<h3 class="font-semibold text-sm uppercase tracking-wider">Call Routing (IVR Menu)</h3>
						</template>
						<div class="space-y-3">
							<div v-for="route in callRoutes" :key="route.id" class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
								<UBadge color="primary" variant="soft">Press {{ route.menu_key }}</UBadge>
								<span class="flex-1 text-sm font-medium">{{ route.department }}</span>
								<span class="text-sm text-gray-500">{{ route.phone_number }}</span>
								<UButton size="xs" color="red" variant="ghost" icon="i-heroicons-trash" @click="removeCallRoute(route.id)" />
							</div>

							<!-- Add Route -->
							<div class="flex items-end gap-3 pt-2 border-t dark:border-gray-700">
								<UFormGroup label="Department" class="flex-1">
									<UInput v-model="newRoute.department" placeholder="e.g. Sales" size="sm" />
								</UFormGroup>
								<UFormGroup label="Key" class="w-20">
									<UInput v-model="newRoute.menu_key" placeholder="1" size="sm" maxlength="1" />
								</UFormGroup>
								<UFormGroup label="Phone Number" class="flex-1">
									<UInput v-model="newRoute.phone_number" placeholder="+15551234567" size="sm" />
								</UFormGroup>
								<UButton size="sm" icon="i-heroicons-plus" :disabled="!newRoute.department || !newRoute.menu_key || !newRoute.phone_number" @click="addCallRoute">
									Add
								</UButton>
							</div>
						</div>
					</UCard>

					<!-- Save Button -->
					<div class="flex justify-end">
						<UButton :loading="saving" size="lg" @click="saveLine">
							Save Settings
						</UButton>
					</div>
				</div>
			</template>
		</div>
	</div>
</template>
