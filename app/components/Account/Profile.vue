<script setup>
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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

// Local form state to avoid mutating auth user directly
const form = ref({
	first_name: '',
	last_name: '',
	title: '',
	phone: '',
	cell_phone: '',
	location: '',
	description: '',
	language: '',
	nickname: '',
	linkedin: '',
	github: '',
	timezone: '',
	appearance: null,
});

// Populate form from user data
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
		language: user.value.language || '',
		nickname: user.value.nickname || '',
		linkedin: user.value.linkedin || '',
		github: user.value.github || '',
		timezone: user.value.timezone || '',
		appearance: user.value.appearance || null,
	};
};

watch(() => user.value?.id, () => populateForm(), { immediate: true });

const appearanceOptions = [
	{ label: 'Auto', value: 'auto' },
	{ label: 'Light', value: 'light' },
	{ label: 'Dark', value: 'dark' },
];

async function updatePerson() {
	saving.value = true;
	try {
		// Build update payload, only include non-empty fields
		const payload = {};
		for (const [key, value] of Object.entries(form.value)) {
			if (value !== '' && value !== null && value !== undefined) {
				payload[key] = value;
			} else if (key === 'appearance') {
				payload[key] = value;
			} else {
				payload[key] = null;
			}
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
	<div class="px-10 account__profile max-w-2xl">
		<h2 class="text-2xl font-bold mb-6">Profile</h2>

		<!-- Avatar Management -->
		<div class="flex items-center gap-5 mb-8">
			<div class="relative group">
				<UserAvatar class="w-20 h-20">
					<AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="user?.first_name" />
					<AvatarFallback class="text-xl">{{ initials }}</AvatarFallback>
				</UserAvatar>
				<button
					type="button"
					@click="avatarInput?.click()"
					class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
				>
					<UIcon name="i-heroicons-camera" class="w-6 h-6 text-white" />
				</button>
				<input
					ref="avatarInput"
					type="file"
					accept="image/*"
					class="hidden"
					@change="handleAvatarSelect"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<p class="text-sm font-medium text-foreground">Profile Photo</p>
				<div class="flex items-center gap-2">
					<UButton
						size="xs"
						variant="outline"
						:label="uploadingAvatar ? 'Uploading...' : 'Upload'"
						:disabled="uploadingAvatar"
						icon="i-heroicons-arrow-up-tray"
						@click="avatarInput?.click()"
					/>
					<UButton
						v-if="avatarUrl"
						size="xs"
						variant="ghost"
						color="red"
						label="Remove"
						icon="i-heroicons-trash"
						@click="removeAvatar"
					/>
				</div>
				<p class="text-[11px] text-muted-foreground">JPG, PNG or GIF. Max 10MB.</p>
			</div>
		</div>

		<form class="grid gap-6" @submit.prevent="updatePerson()">
			<!-- Basic Info -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<UInput
					v-model="form.first_name"
					name="first_name"
					type="text"
					label="First Name"
				/>
				<UInput
					v-model="form.last_name"
					name="last_name"
					type="text"
					label="Last Name"
				/>
			</div>

			<UInput
				:model-value="user?.email"
				name="email"
				type="email"
				label="Email"
				:disabled="true"
			/>

			<UInput
				v-model="form.nickname"
				name="nickname"
				type="text"
				label="Nickname"
			/>

			<UInput
				v-model="form.title"
				name="title"
				type="text"
				label="Title / Role"
				placeholder="e.g. Software Engineer"
			/>

			<UTextarea
				v-model="form.description"
				name="description"
				label="Bio"
				placeholder="Tell us about yourself..."
				:rows="3"
			/>

			<!-- Contact Info -->
			<h3 class="text-lg font-semibold mt-2">Contact Information</h3>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<UInput
					v-model="form.phone"
					name="phone"
					type="tel"
					label="Phone"
				/>
				<UInput
					v-model="form.cell_phone"
					name="cell_phone"
					type="tel"
					label="Cell Phone"
				/>
			</div>

			<UInput
				v-model="form.location"
				name="location"
				type="text"
				label="Location"
				placeholder="e.g. New York, NY"
			/>

			<!-- Social -->
			<h3 class="text-lg font-semibold mt-2">Social Links</h3>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<UInput
					v-model="form.linkedin"
					name="linkedin"
					type="text"
					label="LinkedIn"
					placeholder="https://linkedin.com/in/..."
				/>
				<UInput
					v-model="form.github"
					name="github"
					type="text"
					label="GitHub"
					placeholder="https://github.com/..."
				/>
			</div>

			<!-- Preferences -->
			<h3 class="text-lg font-semibold mt-2">Preferences</h3>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<UInput
					v-model="form.language"
					name="language"
					type="text"
					label="Language"
					placeholder="e.g. en-US"
				/>
				<UInput
					v-model="form.timezone"
					name="timezone"
					type="text"
					label="Timezone"
					placeholder="e.g. America/New_York"
				/>
			</div>

			<USelectMenu
				v-model="form.appearance"
				:options="appearanceOptions"
				value-attribute="value"
				option-attribute="label"
				label="Appearance"
				placeholder="Select theme"
				class="w-full sm:w-48"
			/>

			<UButton class="w-full mt-4 mb-6" type="submit" size="lg" :label="saving ? 'Saving...' : 'Update Profile'" :disabled="saving" block />
		</form>
	</div>
</template>
