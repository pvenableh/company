<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Phone Settings | Earnest' });

const { user } = useDirectusAuth();
const { canAccess } = useOrgRole();
const isAdmin = computed(() => canAccess('org_settings'));
const phoneItems = useDirectusItems('phone_settings');
const businessHourItems = useDirectusItems('business_hours');
const callRouteItems = useDirectusItems('call_routes');
const toast = useToast();

const loading = ref(true);
const saving = ref(false);
const phoneLines = ref<any[]>([]);
const selectedLineId = ref<any>(null);
const showCreateLine = ref(false);
const createStep = ref(1);

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

// Create form — separate from edit form
const newLineForm = reactive({
	line_name: '',
	company_name: '',
	twilio_phone_number: '',
	greeting_text: '',
	voice: 'Polly.Joanna-Neural',
	timezone: 'America/New_York',
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

// Line selector options — computed for reactivity
const lineOptions = computed(() =>
	phoneLines.value.map((l) => ({
		label: `${l.line_name}${l.active ? '' : ' (Inactive)'}`,
		value: l.id,
	})),
);

const selectedLine = computed(() => {
	if (!selectedLineId.value) return null;
	// Use == for loose comparison to handle number/string ID mismatches
	return phoneLines.value.find((l) => String(l.id) === String(selectedLineId.value));
});

async function fetchPhoneLines() {
	loading.value = true;
	try {
		const result = await phoneItems.list({
			fields: ['*', 'business_hours.*', 'call_routes.*'],
			sort: ['sort', 'line_name'],
		});
		phoneLines.value = result || [];
		if (phoneLines.value.length && !selectedLineId.value) {
			populateForm(phoneLines.value[0]);
		}
	} catch (err: any) {
		console.error('Error fetching phone settings:', err);
		toast.add({ title: 'Error loading phone settings', description: err.message, color: 'red' });
	} finally {
		loading.value = false;
	}
}

function handleLineChange(lineId: any) {
	selectedLineId.value = lineId;
	const line = phoneLines.value.find((l) => String(l.id) === String(lineId));
	if (line) populateForm(line);
}

function populateForm(line: any) {
	selectedLineId.value = line.id;

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

function openCreateModal() {
	newLineForm.line_name = '';
	newLineForm.company_name = '';
	newLineForm.twilio_phone_number = '';
	newLineForm.greeting_text = '';
	newLineForm.voice = 'Polly.Joanna-Neural';
	newLineForm.timezone = 'America/New_York';
	createStep.value = 1;
	showCreateLine.value = true;
}

async function createLine() {
	if (!newLineForm.line_name || !newLineForm.company_name) {
		toast.add({ title: 'Line name and company name are required', color: 'red' });
		return;
	}
	saving.value = true;
	try {
		const identifier = newLineForm.line_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
		const created = await phoneItems.create({
			line_name: newLineForm.line_name,
			line_identifier: identifier,
			company_name: newLineForm.company_name,
			twilio_phone_number: newLineForm.twilio_phone_number,
			greeting_text: newLineForm.greeting_text,
			voice: newLineForm.voice,
			timezone: newLineForm.timezone,
			active: true,
			status: 'published',
		});
		toast.add({ title: 'Phone line created', description: 'You can now configure business hours and call routing.', color: 'green' });
		showCreateLine.value = false;
		await fetchPhoneLines();
		if (created?.id) handleLineChange(created.id);
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
		handleLineChange(selectedLineId.value);
	} catch (err: any) {
		toast.add({ title: 'Error adding route', description: err.message, color: 'red' });
	}
}

async function removeCallRoute(routeId: string) {
	try {
		await callRouteItems.remove(routeId);
		toast.add({ title: 'Route removed', color: 'green' });
		await fetchPhoneLines();
		if (selectedLineId.value) handleLineChange(selectedLineId.value);
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
		<div v-if="!isAdmin" class="flex flex-col items-center justify-center z-10 min-h-[60vh] page__inner">
			<h2 class="text-2xl font-proxima-light uppercase tracking-widest text-muted-foreground">Admin Only</h2>
			<p class="text-sm text-muted-foreground mt-2">You need admin access to manage phone settings.</p>
		</div>

		<div v-else class="max-w-5xl mx-auto px-4 py-6 page__inner">
			<!-- Loading -->
			<div v-if="loading" class="flex items-center justify-center min-h-[300px]">
				<div class="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
			</div>

			<template v-else>
				<!-- Line Selector -->
				<div class="flex items-center justify-between mb-6">
					<div class="flex items-center gap-3">
						<USelect
							v-if="phoneLines.length"
							:model-value="selectedLineId"
							@update:model-value="handleLineChange"
							:options="lineOptions"
							placeholder="Select a phone line"
							class="min-w-[200px]"
						/>
						<UBadge v-if="selectedLine?.active" color="green" variant="soft">Active</UBadge>
						<UBadge v-else-if="selectedLine" color="gray" variant="soft">Inactive</UBadge>
					</div>
					<UButton icon="i-heroicons-plus" size="sm" @click="openCreateModal">
						New Line
					</UButton>
				</div>

				<!-- Create Line Modal — improved step-based UX -->
				<UModal v-model="showCreateLine">
					<div class="p-6">
						<div class="flex items-center gap-3 mb-6">
							<div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
								<UIcon name="i-heroicons-phone" class="w-5 h-5 text-primary" />
							</div>
							<div>
								<h3 class="text-lg font-semibold text-foreground">Create Phone Line</h3>
								<p class="text-xs text-muted-foreground">
									{{ createStep === 1 ? 'Step 1: Basic information' : 'Step 2: Voice & greeting' }}
								</p>
							</div>
						</div>

						<!-- Step 1: Basics -->
						<div v-if="createStep === 1" class="space-y-4">
							<UFormGroup label="Line Name" required hint="A friendly name for this phone line">
								<UInput v-model="newLineForm.line_name" placeholder="e.g. Main Office, Sales Line, Support" />
							</UFormGroup>

							<UFormGroup label="Company Name" required hint="Shown in caller ID and used in greetings">
								<UInput v-model="newLineForm.company_name" placeholder="Your company or brand name" />
							</UFormGroup>

							<UFormGroup label="Twilio Phone Number" hint="The phone number from your Twilio account">
								<UInput v-model="newLineForm.twilio_phone_number" placeholder="+1 (555) 123-4567" />
								<template #help>
									<span class="text-xs text-muted-foreground">
										Format: +1XXXXXXXXXX. Find this in your
										<a href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming" target="_blank" class="text-primary hover:underline">Twilio Console</a>.
										You can add this later.
									</span>
								</template>
							</UFormGroup>

							<div class="flex justify-end gap-2 pt-4 border-t border-border">
								<UButton color="gray" variant="soft" @click="showCreateLine = false">Cancel</UButton>
								<UButton
									:disabled="!newLineForm.line_name || !newLineForm.company_name"
									@click="createStep = 2"
								>
									Next
									<UIcon name="i-heroicons-arrow-right" class="w-3.5 h-3.5 ml-1" />
								</UButton>
							</div>
						</div>

						<!-- Step 2: Voice & Greeting -->
						<div v-else-if="createStep === 2" class="space-y-4">
							<UFormGroup label="Greeting Message" hint="What callers hear when they dial in">
								<UTextarea
									v-model="newLineForm.greeting_text"
									placeholder="Thank you for calling [Company]. For sales, press 1. For support, press 2. To speak with a representative, please stay on the line."
									rows="3"
								/>
							</UFormGroup>

							<div class="grid grid-cols-2 gap-4">
								<UFormGroup label="Voice" hint="Text-to-speech voice for greetings">
									<USelect v-model="newLineForm.voice" :options="VOICE_OPTIONS" />
								</UFormGroup>

								<UFormGroup label="Timezone" hint="Used for business hours">
									<USelect v-model="newLineForm.timezone" :options="TIMEZONE_OPTIONS" />
								</UFormGroup>
							</div>

							<div class="bg-muted/50 rounded-lg p-3">
								<p class="text-xs text-muted-foreground">
									<UIcon name="i-heroicons-information-circle" class="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
									You can configure business hours and call routing after creating the line.
								</p>
							</div>

							<div class="flex justify-between pt-4 border-t border-border">
								<UButton color="gray" variant="ghost" @click="createStep = 1">
									<UIcon name="i-heroicons-arrow-left" class="w-3.5 h-3.5 mr-1" />
									Back
								</UButton>
								<div class="flex gap-2">
									<UButton color="gray" variant="soft" @click="showCreateLine = false">Cancel</UButton>
									<UButton :loading="saving" @click="createLine">
										<UIcon name="i-heroicons-phone" class="w-3.5 h-3.5 mr-1" />
										Create Line
									</UButton>
								</div>
							</div>
						</div>
					</div>
				</UModal>

				<!-- No Lines -->
				<div v-if="phoneLines.length === 0" class="text-center py-12 border-2 border-dashed border-border rounded-lg">
					<UIcon name="i-heroicons-phone" class="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
					<h3 class="text-lg font-medium text-foreground">No Phone Lines Configured</h3>
					<p class="text-sm text-muted-foreground mt-1 mb-4">Create your first phone line to get started with your IVR system.</p>
					<UButton icon="i-heroicons-plus" @click="openCreateModal">Create Phone Line</UButton>
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
							<UFormGroup label="Line Identifier" hint="Used in API integrations">
								<UInput v-model="lineForm.line_identifier" placeholder="e.g. main, support" />
							</UFormGroup>
							<UFormGroup label="Company Name" required>
								<UInput v-model="lineForm.company_name" />
							</UFormGroup>
							<UFormGroup label="Twilio Phone Number">
								<UInput v-model="lineForm.twilio_phone_number" placeholder="+15551234567" />
							</UFormGroup>
							<UFormGroup label="TTS Voice" hint="Voice used for automated messages">
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
						<UFormGroup label="Greeting Text" hint="What callers hear when they dial in">
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
									<span class="text-muted-foreground">to</span>
									<UInput v-model="businessHours[day].close_time" type="time" size="sm" class="w-32" />
								</template>
								<span v-else class="text-sm text-muted-foreground">Closed</span>
							</div>

							<UFormGroup label="After Hours Message" class="mt-4">
								<UTextarea v-model="lineForm.after_hours_message" placeholder="We are currently closed. Please call back during business hours." rows="2" />
							</UFormGroup>
						</div>
						<p v-else class="text-sm text-muted-foreground">Enable business hours to configure when callers can reach you.</p>
					</UCard>

					<!-- Call Routing -->
					<UCard>
						<template #header>
							<div>
								<h3 class="font-semibold text-sm uppercase tracking-wider">Call Routing (IVR Menu)</h3>
								<p class="text-xs text-muted-foreground mt-1">Map keypad numbers to departments and phone numbers</p>
							</div>
						</template>
						<div class="space-y-3">
							<div v-for="route in callRoutes" :key="route.id" class="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
								<UBadge color="primary" variant="soft">Press {{ route.menu_key }}</UBadge>
								<span class="flex-1 text-sm font-medium">{{ route.department }}</span>
								<span class="text-sm text-muted-foreground">{{ route.phone_number }}</span>
								<UButton size="xs" color="red" variant="ghost" icon="i-heroicons-trash" @click="removeCallRoute(route.id)" />
							</div>

							<div v-if="callRoutes.length === 0" class="text-center py-4 text-muted-foreground text-sm">
								No routes configured. Add a route to enable "Press 1 for Sales" style menus.
							</div>

							<!-- Add Route -->
							<div class="flex items-end gap-3 pt-3 border-t border-border">
								<UFormGroup label="Department" class="flex-1" hint="e.g. Sales, Support">
									<UInput v-model="newRoute.department" placeholder="Sales" size="sm" />
								</UFormGroup>
								<UFormGroup label="Key" class="w-20" hint="0-9">
									<UInput v-model="newRoute.menu_key" placeholder="1" size="sm" maxlength="1" />
								</UFormGroup>
								<UFormGroup label="Forward To" class="flex-1" hint="Phone number">
									<UInput v-model="newRoute.phone_number" placeholder="+15551234567" size="sm" />
								</UFormGroup>
								<UButton size="sm" icon="i-heroicons-plus" :disabled="!newRoute.department || !newRoute.menu_key || !newRoute.phone_number" @click="addCallRoute">
									Add
								</UButton>
							</div>
						</div>
					</UCard>

					<!-- Save Button -->
					<div class="flex justify-end pb-safe">
						<UButton :loading="saving" size="lg" @click="saveLine">
							Save Settings
						</UButton>
					</div>
				</div>
			</template>
		</div>
	</div>
</template>
