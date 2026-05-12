<script setup>
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

const { updateMe } = useDirectusUsers();
const { user, fetchSession } = useDirectusAuth();
const config = useRuntimeConfig();
const toast = useToast();
const saving = ref(false);
const uploadingAvatar = ref(false);
const avatarInput = ref(null);

const { processUpload, uploadFilesWithProgress, resetUploadState } = useFileUpload();

const avatarUrl = computed(() => {
	if (!user.value?.avatar) return null;
	return `${config.public.assetsUrl}${user.value.avatar}?key=avatar`;
});

const initials = computed(() => {
	if (!user.value) return 'U';
	const first = user.value.first_name?.[0] ?? '';
	const last = user.value.last_name?.[0] ?? '';
	return (first + last).toUpperCase() || 'U';
});

async function handleAvatarSelect(event) {
	const files = event.target.files;
	if (!files?.length) return;

	uploadingAvatar.value = true;
	try {
		const result = await processUpload(files, { compressImages: true });
		if (!result.success) {
			toast.add({ icon: 'i-heroicons-exclamation-circle', title: 'Error', description: result.errors[0], color: 'red' });
			return;
		}

		const uploaded = await uploadFilesWithProgress(result.formData);
		const fileId = Array.isArray(uploaded) ? uploaded[0]?.id : uploaded?.id;

		if (fileId) {
			await updateMe({ avatar: fileId });
			await fetchSession();
			toast.add({ icon: 'i-heroicons-check-circle-solid', title: 'Avatar updated!' });
		}
	} catch (error) {
		console.error('Avatar upload error:', error);
		toast.add({ icon: 'i-heroicons-exclamation-circle', title: 'Error', description: 'Failed to upload avatar.', color: 'red' });
	} finally {
		uploadingAvatar.value = false;
		resetUploadState();
		if (avatarInput.value) avatarInput.value.value = '';
	}
}

async function removeAvatar() {
	try {
		await updateMe({ avatar: null });
		await fetchSession();
		toast.add({ icon: 'i-heroicons-check-circle-solid', title: 'Avatar removed.' });
	} catch (error) {
		toast.add({ icon: 'i-heroicons-exclamation-circle', title: 'Error', description: 'Failed to remove avatar.', color: 'red' });
	}
}

// Local form state to avoid mutating auth user directly. `language` and
// `appearance` are intentionally not surfaced — only one supported language
// today, and appearance is configured under the Appearance tab.
const form = ref({
	first_name: '',
	last_name: '',
	title: '',
	phone: '',
	cell_phone: '',
	location: '',
	description: '',
	nickname: '',
	linkedin: '',
	github: '',
	timezone: '',
});

const populateForm = () => {
	if (!user.value) return;
	form.value = {
		first_name: user.value.first_name || '',
		last_name: user.value.last_name || '',
		title: user.value.title || '',
		phone: user.value.phone || '',
		cell_phone: user.value.cell_phone || '',
		location: user.value.location || '',
		description: user.value.description || '',
		nickname: user.value.nickname || '',
		linkedin: user.value.linkedin || '',
		github: user.value.github || '',
		timezone: user.value.timezone || '',
	};
};

watch(() => user.value?.id, () => populateForm(), { immediate: true });

// Curated timezone list. Earnest is US-marketed, so the dropdown leads with
// the US zones (Eastern at the top) and surfaces a short international list
// below. Anyone abroad still finds their region; we just skip the 400+ IANA
// dump that buries the common picks.
const usTimezones = [
	{ value: 'America/New_York',    label: 'Eastern (New York)' },
	{ value: 'America/Chicago',     label: 'Central (Chicago)' },
	{ value: 'America/Denver',      label: 'Mountain (Denver)' },
	{ value: 'America/Phoenix',     label: 'Mountain — Arizona (no DST)' },
	{ value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
	{ value: 'America/Anchorage',   label: 'Alaska (Anchorage)' },
	{ value: 'Pacific/Honolulu',    label: 'Hawaii (Honolulu)' },
];

const internationalTimezones = [
	{ value: 'UTC',                 label: 'UTC' },
	{ value: 'Europe/London',       label: 'London' },
	{ value: 'Europe/Paris',        label: 'Paris' },
	{ value: 'Europe/Berlin',       label: 'Berlin' },
	{ value: 'Europe/Madrid',       label: 'Madrid' },
	{ value: 'Europe/Amsterdam',    label: 'Amsterdam' },
	{ value: 'Africa/Johannesburg', label: 'Johannesburg' },
	{ value: 'Asia/Dubai',          label: 'Dubai' },
	{ value: 'Asia/Kolkata',        label: 'Mumbai / Kolkata' },
	{ value: 'Asia/Singapore',      label: 'Singapore' },
	{ value: 'Asia/Hong_Kong',      label: 'Hong Kong' },
	{ value: 'Asia/Tokyo',          label: 'Tokyo' },
	{ value: 'Asia/Shanghai',       label: 'Shanghai' },
	{ value: 'Australia/Sydney',    label: 'Sydney' },
	{ value: 'Australia/Perth',     label: 'Perth' },
	{ value: 'Pacific/Auckland',    label: 'Auckland' },
	{ value: 'America/Toronto',     label: 'Toronto' },
	{ value: 'America/Vancouver',   label: 'Vancouver' },
	{ value: 'America/Mexico_City', label: 'Mexico City' },
	{ value: 'America/Sao_Paulo',   label: 'São Paulo' },
];

function detectBrowserTimezone() {
	try {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (tz) form.value.timezone = tz;
	} catch { /* ignore */ }
}

async function updatePerson() {
	saving.value = true;
	try {
		// Only persist non-empty fields. Empty strings become nulls so cleared
		// values are written back. Language + appearance are managed elsewhere
		// and are deliberately excluded from the payload.
		const payload = {};
		for (const [key, value] of Object.entries(form.value)) {
			payload[key] = value === '' || value === null || value === undefined ? null : value;
		}

		await updateMe(payload);
		await fetchSession();

		toast.add({ icon: 'i-heroicons-check-circle-solid', title: 'Success!', description: 'Profile updated.' });
	} catch (error) {
		console.error(error);
		toast.add({ icon: 'i-heroicons-exclamation-circle', title: 'Error', description: 'Failed to update profile.', color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>

<template>
	<div class="account-profile">
		<!-- Avatar + identity header -->
		<div class="ios-card flex flex-wrap items-center gap-5 p-5 mb-6">
			<div class="relative group shrink-0">
				<UserAvatar class="w-20 h-20">
					<AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="user?.first_name" />
					<AvatarFallback class="text-xl">{{ initials }}</AvatarFallback>
				</UserAvatar>
				<button
					type="button"
					class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
					@click="avatarInput?.click()"
				>
					<Icon name="lucide:camera" class="w-6 h-6 text-white" />
				</button>
				<input
					ref="avatarInput"
					type="file"
					accept="image/*"
					class="hidden"
					@change="handleAvatarSelect"
				/>
			</div>
			<div class="flex flex-col gap-2 min-w-0">
				<p class="text-sm font-semibold text-foreground">Profile Photo</p>
				<div class="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						:disabled="uploadingAvatar"
						@click="avatarInput?.click()"
					>
						<Icon name="lucide:upload" class="w-3.5 h-3.5 mr-1.5" />
						{{ uploadingAvatar ? 'Uploading…' : 'Upload' }}
					</Button>
					<Button
						v-if="avatarUrl"
						type="button"
						size="sm"
						variant="ghost"
						class="text-red-500 hover:text-red-600 hover:bg-red-500/10"
						@click="removeAvatar"
					>
						<Icon name="lucide:trash-2" class="w-3.5 h-3.5 mr-1.5" />
						Remove
					</Button>
				</div>
				<p class="text-[11px] text-muted-foreground">JPG, PNG or GIF. Max 10MB.</p>
			</div>
		</div>

		<form class="grid gap-6" @submit.prevent="updatePerson()">
			<!-- Two-column grid on lg+, single column on smaller screens -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<!-- ── Identity ───────────────────────────────────────── -->
				<section class="ios-card p-5 space-y-4">
					<h3 class="account-profile__section-title">Identity</h3>

					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<Label for="first_name">First name</Label>
							<Input id="first_name" v-model="form.first_name" placeholder="Jane" />
						</div>
						<div class="space-y-1.5">
							<Label for="last_name">Last name</Label>
							<Input id="last_name" v-model="form.last_name" placeholder="Doe" />
						</div>
					</div>

					<div class="space-y-1.5">
						<Label for="email">Email</Label>
						<Input id="email" :model-value="user?.email" type="email" disabled />
					</div>

					<div class="space-y-1.5">
						<Label for="nickname">Nickname</Label>
						<Input id="nickname" v-model="form.nickname" placeholder="What should we call you?" />
					</div>

					<div class="space-y-1.5">
						<Label for="title">Title / Role</Label>
						<Input id="title" v-model="form.title" placeholder="e.g. Software Engineer" />
					</div>

					<div class="space-y-1.5">
						<Label for="bio">Bio</Label>
						<Textarea id="bio" v-model="form.description" placeholder="Tell us about yourself…" rows="3" />
					</div>
				</section>

				<!-- ── Right column: contact + social + preferences ──── -->
				<div class="space-y-6">
					<section class="ios-card p-5 space-y-4">
						<h3 class="account-profile__section-title">Contact</h3>

						<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<div class="space-y-1.5">
								<Label for="phone">Phone</Label>
								<Input id="phone" v-model="form.phone" type="tel" placeholder="(555) 123-4567" />
							</div>
							<div class="space-y-1.5">
								<Label for="cell_phone">Cell phone</Label>
								<Input id="cell_phone" v-model="form.cell_phone" type="tel" placeholder="(555) 987-6543" />
							</div>
						</div>

						<div class="space-y-1.5">
							<Label for="location">Location</Label>
							<Input id="location" v-model="form.location" placeholder="e.g. New York, NY" />
						</div>
					</section>

					<section class="ios-card p-5 space-y-4">
						<h3 class="account-profile__section-title">Social</h3>

						<div class="space-y-1.5">
							<Label for="linkedin">LinkedIn</Label>
							<Input id="linkedin" v-model="form.linkedin" placeholder="https://linkedin.com/in/…" />
						</div>

						<div class="space-y-1.5">
							<Label for="github">GitHub</Label>
							<Input id="github" v-model="form.github" placeholder="https://github.com/…" />
						</div>
					</section>

					<section class="ios-card p-5 space-y-4">
						<div class="flex items-center justify-between gap-3">
							<h3 class="account-profile__section-title m-0">Preferences</h3>
							<button
								type="button"
								class="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
								@click="detectBrowserTimezone"
							>
								<Icon name="lucide:locate-fixed" class="size-3" />
								Use my time zone
							</button>
						</div>

						<div class="space-y-1.5">
							<Label for="timezone">Time zone</Label>
							<Select v-model="form.timezone">
								<SelectTrigger id="timezone" class="w-full">
									<SelectValue placeholder="Select time zone…" />
								</SelectTrigger>
								<SelectContent class="max-h-80">
									<SelectGroup>
										<SelectLabel>United States</SelectLabel>
										<SelectItem v-for="tz in usTimezones" :key="tz.value" :value="tz.value">
											{{ tz.label }}
										</SelectItem>
									</SelectGroup>
									<SelectSeparator />
									<SelectGroup>
										<SelectLabel>International</SelectLabel>
										<SelectItem v-for="tz in internationalTimezones" :key="tz.value" :value="tz.value">
											{{ tz.label }}
										</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
					</section>
				</div>
			</div>

			<div class="flex justify-end">
				<Button type="submit" :disabled="saving" size="lg">
					<Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
					{{ saving ? 'Saving…' : 'Update Profile' }}
				</Button>
			</div>
		</form>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.account-profile {
	@apply w-full;
}

.account-profile__section-title {
	@apply text-sm font-semibold text-foreground tracking-tight;
}
</style>
