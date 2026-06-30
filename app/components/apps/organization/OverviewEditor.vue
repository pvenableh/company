<!--
	OverviewEditor — inline org-fields editor for the Overview floor of
	/apps/organization. Replaces the punch-out from the Overview "Edit"
	header CTA to /organization.

	Three independently-saved cards (Info / Brand & Strategy / Contact)
	mirror the read-only Overview display, plus a logo uploader at the
	top. Each save calls `organizationItems.update` and refreshes
	`useOrganization().fetchOrganizationDetails()` so the read view (and
	every other consumer of currentOrg) repaints reactively.

	Pattern source: /organization/index.vue's inline-editing sections
	(`startEditInfo` / `saveInfo`, `startEditBrand` / `saveBrand`,
	`startEditBilling` / `saveBilling`, `onLogoFileSelected`) — extracted
	verbatim so behavior parity is total.
-->
<script setup lang="ts">
const toast = useToast();
const config = useRuntimeConfig();
const organizationItems = useDirectusItems('organizations');
const industryItems = useDirectusItems('industries');
const { selectedOrg, fetchOrganizationDetails } = useOrganization();
const { processUpload, uploadFilesWithProgress, startUpload, resetUploadState, isUploading: logoUploading } = useFileUpload();
const { getOrgFolderId } = useOrgFolders();

const props = defineProps<{
	canManage?: boolean;
}>();

const emit = defineEmits<{
	(e: 'saved'): void;
}>();

const ORG_DETAIL_FIELDS = [
	'id', 'name', 'slug', 'logo', 'category', 'notes', 'website', 'phone', 'address',
	'industry.id', 'industry.name', 'industry.class', 'brand_color', 'email', 'emails',
	'date_created', 'origin_date', 'icon', 'active', 'brand_direction',
	'goals', 'target_audience', 'location', 'default_hourly_rate',
];

const org = ref<any>(null);
const loading = ref(false);

async function fetchOrg() {
	if (!selectedOrg.value) return;
	loading.value = true;
	try {
		const rows = await organizationItems.list({
			filter: { id: { _eq: selectedOrg.value } },
			fields: ORG_DETAIL_FIELDS,
			limit: 1,
		});
		org.value = rows?.[0] || null;
	} catch (err: any) {
		console.error('OverviewEditor fetch failed:', err);
		org.value = null;
	} finally {
		loading.value = false;
	}
}

watch(selectedOrg, () => fetchOrg(), { immediate: true });

const industries = ref<any[]>([]);
async function fetchIndustries() {
	try {
		industries.value = await industryItems.list({
			fields: ['id', 'name'],
			filter: { status: { _eq: 'published' } },
			sort: ['name'],
			limit: -1,
		});
	} catch {
		industries.value = [];
	}
}
fetchIndustries();

const orgLogoUrl = computed(() => {
	const o = org.value;
	if (!o) return null;
	const logoId = o.logo
		? (typeof o.logo === 'object' ? o.logo?.id : o.logo)
		: o.icon
			? (typeof o.icon === 'object' ? o.icon?.id : o.icon)
			: null;
	if (!logoId) return null;
	return `${config.public.directusUrl}/assets/${logoId}?key=medium-contain`;
});

// ── Logo upload ─────────────────────────────────────────────────────────────
const logoInput = ref<HTMLInputElement | null>(null);

async function onLogoFileSelected(event: Event) {
	const target = event.target as HTMLInputElement;
	const file = target.files?.[0];
	if (!file || !org.value?.id) return;

	startUpload();
	try {
		const result = await processUpload([file]);
		if (!result.success) {
			toast.add({ title: 'Error', description: result.errors[0], color: 'red' });
			return;
		}
		const orgFolder = getOrgFolderId();
		if (orgFolder) result.formData.append('folder', orgFolder);
		const uploaded = await uploadFilesWithProgress(result.formData);
		const fileId = uploaded?.id || uploaded?.[0]?.id;
		if (fileId) {
			await organizationItems.update(org.value.id, { logo: fileId });
			toast.add({ title: 'Success', description: 'Logo updated', color: 'green' });
			await fetchOrg();
			await fetchOrganizationDetails();
			emit('saved');
		}
	} catch (err) {
		console.error('Logo upload failed:', err);
		toast.add({ title: 'Error', description: 'Failed to upload logo', color: 'red' });
	} finally {
		resetUploadState();
		if (logoInput.value) logoInput.value.value = '';
	}
}

// ── Info ────────────────────────────────────────────────────────────────────
const savingInfo = ref(false);
const infoForm = ref({
	name: '',
	slug: '',
	website: '',
	notes: '',
	brand_color: '',
	industry: '' as string | number,
	active: true,
});

watch(org, (o) => {
	if (!o) return;
	infoForm.value = {
		name: o.name || '',
		slug: o.slug || '',
		website: o.website || '',
		notes: o.notes || '',
		brand_color: o.brand_color || '',
		industry: (typeof o.industry === 'object' ? o.industry?.id : o.industry) || '',
		active: o.active !== false,
	};
}, { immediate: true });

// ── Booking URL slug ──
// Mirrors the server's generation rules (server/api/org/create.post.ts) and the
// classic /organization page. The slug is the org portion of the public booking
// URL (/book/<slug>/<user-slug>) and has a unique index in Directus.
function sanitizeSlug(raw: string) {
	return (raw || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-')
		.slice(0, 40);
}
const slugPreview = computed(() => sanitizeSlug(infoForm.value.slug));
const slugValid = computed(() => slugPreview.value.length >= 2 && slugPreview.value.length <= 40);
const slugChanged = computed(() => slugPreview.value !== (org.value?.slug || ''));
const bookingUrlBase = computed(() =>
	config.public.siteUrl || (import.meta.client ? window.location.origin : ''),
);

async function saveInfo() {
	if (!org.value?.id) return;

	const nextSlug = slugPreview.value;
	if (!slugValid.value) {
		toast.add({ title: 'Invalid booking slug', description: 'Use 2–40 lowercase letters, numbers, or hyphens.', color: 'red' });
		return;
	}

	savingInfo.value = true;
	try {
		// Best-effort uniqueness pre-check; the DB unique index is the real guard.
		if (slugChanged.value) {
			try {
				const dupes = await organizationItems.list({
					filter: { slug: { _eq: nextSlug }, id: { _neq: org.value.id } },
					fields: ['id'],
					limit: 1,
				});
				if (dupes?.length) {
					toast.add({ title: 'Slug already taken', description: `"${nextSlug}" is in use by another organization.`, color: 'red' });
					savingInfo.value = false;
					return;
				}
			} catch { /* perms may block cross-org reads — fall through to the catch */ }
		}

		await organizationItems.update(org.value.id, {
			name: infoForm.value.name,
			slug: nextSlug,
			website: infoForm.value.website || null,
			notes: infoForm.value.notes || null,
			brand_color: infoForm.value.brand_color || null,
			industry: infoForm.value.industry || null,
			active: infoForm.value.active,
		});
		toast.add({ title: 'Saved', description: 'Organization info updated', color: 'green' });
		await fetchOrg();
		await fetchOrganizationDetails();
		emit('saved');
	} catch (err: any) {
		const raw = err?.data?.message || err?.message || '';
		const isDupe = /unique|already exists|RECORD_NOT_UNIQUE|FIELD_NOT_UNIQUE/i.test(raw);
		const msg = isDupe ? 'That booking slug is already taken — try another.' : (raw || 'Failed to update organization info');
		toast.add({ title: 'Error', description: msg, color: 'red' });
	} finally {
		savingInfo.value = false;
	}
}

// ── Brand & Strategy ────────────────────────────────────────────────────────
const savingBrand = ref(false);
const brandForm = ref({
	brand_direction: '',
	goals: '',
	target_audience: '',
	location: '',
});

watch(org, (o) => {
	if (!o) return;
	brandForm.value = {
		brand_direction: o.brand_direction || '',
		goals: o.goals || '',
		target_audience: o.target_audience || '',
		location: o.location || '',
	};
}, { immediate: true });

async function saveBrand() {
	if (!org.value?.id) return;
	savingBrand.value = true;
	try {
		await organizationItems.update(org.value.id, {
			brand_direction: brandForm.value.brand_direction || null,
			goals: brandForm.value.goals || null,
			target_audience: brandForm.value.target_audience || null,
			location: brandForm.value.location || null,
		});
		toast.add({ title: 'Saved', description: 'Brand & strategy updated', color: 'green' });
		await fetchOrg();
		await fetchOrganizationDetails();
		emit('saved');
	} catch (err: any) {
		const msg = err?.data?.message || err?.message || 'Failed to update brand & strategy';
		toast.add({ title: 'Error', description: msg, color: 'red' });
	} finally {
		savingBrand.value = false;
	}
}

// ── Contact / billing ───────────────────────────────────────────────────────
const savingContact = ref(false);
const contactForm = ref({
	email: '',
	phone: '',
	address: '',
	default_hourly_rate: null as number | null,
});

watch(org, (o) => {
	if (!o) return;
	contactForm.value = {
		email: o.email || '',
		phone: o.phone || '',
		address: o.address || '',
		default_hourly_rate: o.default_hourly_rate ?? null,
	};
}, { immediate: true });

async function saveContact() {
	if (!org.value?.id) return;
	savingContact.value = true;
	try {
		await organizationItems.update(org.value.id, {
			email: contactForm.value.email || null,
			phone: contactForm.value.phone || null,
			address: contactForm.value.address || null,
			default_hourly_rate: contactForm.value.default_hourly_rate || null,
		});
		toast.add({ title: 'Saved', description: 'Contact info updated', color: 'green' });
		await fetchOrg();
		await fetchOrganizationDetails();
		emit('saved');
	} catch (err: any) {
		const msg = err?.data?.message || err?.message || 'Failed to update contact info';
		toast.add({ title: 'Error', description: msg, color: 'red' });
	} finally {
		savingContact.value = false;
	}
}
</script>

<template>
	<div v-if="!org && loading" class="flex flex-col items-center justify-center py-16 gap-3">
		<span class="spinner-ios spinner-ios--lg" role="status" aria-label="Loading" />
		<p class="text-sm text-muted-foreground">Loading editor…</p>
	</div>

	<div v-else-if="org" class="space-y-5">
		<!-- Logo + identity row -->
		<div class="ios-card p-5">
			<div class="flex items-center gap-4">
				<div
					class="group relative w-16 h-16 rounded-xl overflow-hidden bg-muted flex items-center justify-center shrink-0"
					:style="!orgLogoUrl && org.brand_color ? { backgroundColor: org.brand_color } : {}"
				>
					<img v-if="orgLogoUrl" :src="orgLogoUrl" :alt="org.name" class="w-full h-full object-contain" />
					<Icon v-else name="lucide:building-2" class="w-7 h-7 text-muted-foreground" />

					<label
						v-if="canManage"
						class="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
						:class="logoUploading && '!opacity-100'"
					>
						<input
							ref="logoInput"
							type="file"
							accept="image/*"
							class="sr-only"
							:disabled="logoUploading"
							@change="onLogoFileSelected"
						/>
						<Icon
							:name="logoUploading ? 'lucide:loader-2' : 'lucide:camera'"
							class="w-5 h-5 text-white"
							:class="logoUploading && 'animate-spin'"
						/>
					</label>
				</div>
				<div class="flex-1 min-w-0">
					<h2 class="text-base font-semibold truncate">{{ org.name }}</h2>
					<p class="text-xs text-muted-foreground mt-0.5">
						Hover the logo to upload a new image · JPG / PNG / SVG up to 5MB
					</p>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
			<!-- Brand & Strategy (spans 2 cols on lg) -->
			<div class="lg:col-span-2 space-y-5">
				<div class="ios-card p-5">
					<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-4">
						Brand &amp; Strategy
					</h3>

					<div class="space-y-4">
						<BrandAIFieldSuggest
							v-model="brandForm.brand_direction"
							label="Brand Direction"
							field="brand_direction"
							placeholder="Brand positioning, voice, visual style, and messaging strategy…"
							entity-type="organization"
							:entity-id="org.id || ''"
							:organization-id="org.id || ''"
						/>

						<BrandAIFieldSuggest
							v-model="brandForm.goals"
							label="Goals"
							field="goals"
							placeholder="Business goals and objectives…"
							entity-type="organization"
							:entity-id="org.id || ''"
							:organization-id="org.id || ''"
						/>

						<BrandAIFieldSuggest
							v-model="brandForm.target_audience"
							label="Target Audience"
							field="target_audience"
							placeholder="Ideal customer profile, demographics, psychographics…"
							entity-type="organization"
							:entity-id="org.id || ''"
							:organization-id="org.id || ''"
						/>

						<UFormGroup label="Location">
							<UInput v-model="brandForm.location" placeholder="City, region, or Remote / Global" />
						</UFormGroup>

						<div class="flex justify-end">
							<Button size="sm" :disabled="savingBrand" @click="saveBrand">
								<Icon
									:name="savingBrand ? 'lucide:loader-2' : 'lucide:save'"
									class="w-4 h-4 mr-1"
									:class="savingBrand && 'animate-spin'"
								/>
								Save Brand
							</Button>
						</div>
					</div>
				</div>
			</div>

			<!-- Info + Contact sidebar -->
			<div class="space-y-5">
				<div class="ios-card p-5">
					<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-4">
						Info
					</h3>

					<div class="space-y-3">
						<UFormGroup label="Name" required>
							<UInput v-model="infoForm.name" placeholder="Organization name" />
						</UFormGroup>
						<UFormGroup
							label="Booking URL slug"
							:error="infoForm.slug && !slugValid ? 'Use 2–40 lowercase letters, numbers, or hyphens.' : undefined"
						>
							<UInput v-model="infoForm.slug" placeholder="your-org" class="font-mono" />
							<template #hint>
								<span class="text-[10px] text-muted-foreground">The org portion of your public booking link.</span>
							</template>
							<p v-if="slugPreview" class="mt-1.5 text-[11px] text-muted-foreground break-all">
								{{ bookingUrlBase.replace(/^https?:\/\//, '') }}/book/<span class="font-semibold text-foreground">{{ slugPreview }}</span>/…
							</p>
							<p v-if="slugChanged && org?.slug" class="mt-1 text-[11px] text-amber-600 dark:text-amber-500">
								Changing this breaks any booking links that use the old slug ({{ org.slug }}).
							</p>
						</UFormGroup>
						<UFormGroup label="Industry">
							<select
								v-model="infoForm.industry"
								class="w-full rounded-full border bg-background px-3 py-2 text-sm"
							>
								<option value="">Select industry…</option>
								<option v-for="ind in industries" :key="ind.id" :value="ind.id">{{ ind.name }}</option>
							</select>
						</UFormGroup>
						<UFormGroup label="Website">
							<UInput v-model="infoForm.website" placeholder="https://example.com" />
						</UFormGroup>
						<UFormGroup label="Notes">
							<UTextarea
								v-model="infoForm.notes"
								placeholder="Organization description or notes"
								:rows="2"
								autoresize
							/>
						</UFormGroup>
						<UFormGroup label="Brand Color">
							<div class="flex items-center gap-3">
								<input
									v-model="infoForm.brand_color"
									type="color"
									class="w-8 h-8 rounded cursor-pointer border border-gray-200"
								/>
								<UInput v-model="infoForm.brand_color" placeholder="#000000" class="flex-1" />
							</div>
						</UFormGroup>
						<UFormGroup label="Active">
							<div class="flex items-center gap-3">
								<UToggle v-model="infoForm.active" />
								<span class="text-xs text-muted-foreground">
									{{ infoForm.active ? 'Visible in selectors' : 'Hidden from selectors' }}
								</span>
							</div>
						</UFormGroup>

						<div class="flex justify-end pt-1">
							<Button size="sm" :disabled="savingInfo || !infoForm.name || !slugValid" @click="saveInfo">
								<Icon
									:name="savingInfo ? 'lucide:loader-2' : 'lucide:save'"
									class="w-4 h-4 mr-1"
									:class="savingInfo && 'animate-spin'"
								/>
								Save Info
							</Button>
						</div>
					</div>
				</div>

				<div class="ios-card p-5">
					<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-4">
						Contact
					</h3>

					<div class="space-y-3">
						<UFormGroup label="Email">
							<UInput
								v-model="contactForm.email"
								type="email"
								placeholder="billing@example.com"
							/>
						</UFormGroup>
						<UFormGroup label="Phone">
							<UInput v-model="contactForm.phone" placeholder="+1 (555) 000-0000" />
						</UFormGroup>
						<UFormGroup label="Address">
							<UTextarea
								v-model="contactForm.address"
								placeholder="Street address, city, state, ZIP"
								:rows="3"
								autoresize
							/>
						</UFormGroup>
						<UFormGroup
							label="Default Hourly Rate"
							help="Auto-populated in time tracking when billable is enabled"
						>
							<UInput
								v-model="contactForm.default_hourly_rate"
								type="number"
								placeholder="0.00"
								step="0.01"
								min="0"
								icon="i-heroicons-currency-dollar"
							/>
						</UFormGroup>

						<div class="flex justify-end pt-1">
							<Button size="sm" :disabled="savingContact" @click="saveContact">
								<Icon
									:name="savingContact ? 'lucide:loader-2' : 'lucide:save'"
									class="w-4 h-4 mr-1"
									:class="savingContact && 'animate-spin'"
								/>
								Save Contact
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
