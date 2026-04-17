<script setup lang="ts">
import type { Contact } from '~~/shared/email/contacts';
import { useDebounceFn } from '@vueuse/core';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Email | Earnest' });

const router = useRouter();
const { getContacts } = useContacts();
const { getLists } = useMailingLists();
const { getTemplates, getStarterTemplates, createTemplate, duplicateTemplate } = useEmailTemplates();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

const activeTab = ref(0);
const tabs = [
	{ key: 'templates', label: 'Templates', icon: 'lucide:layout-template' },
	{ key: 'lists', label: 'Lists', icon: 'lucide:list' },
	{ key: 'contacts', label: 'Contacts', icon: 'lucide:users' },
];

// Templates state
const templates = ref<any[]>([]);
const templatesLoading = ref(true);
const starterTemplates = ref<any[]>([]);

// Contacts state
const contacts = ref<Contact[]>([]);
const contactTotal = ref(0);
const contactLoading = ref(true);
const search = ref('');
const page = ref(1);
const limit = 50;
const hasMore = computed(() => page.value * limit < contactTotal.value);

// Lists state
const lists = ref<any[]>([]);
const listsLoading = ref(true);

// New template modal
const showNewTemplate = ref(false);
const newTemplateName = ref('');
const newTemplateType = ref<'newsletter' | 'transactional'>('newsletter');
const creatingTemplate = ref(false);
const startMethod = ref<'blank' | 'existing' | 'starter' | 'ai' | null>(null);
const selectedSourceTemplate = ref<any>(null);

const fetchTemplates = async () => {
	templatesLoading.value = true;
	try {
		templates.value = await getTemplates();
	} catch {
		templates.value = [];
	}
	templatesLoading.value = false;
};

const fetchStarterTemplates = async () => {
	try {
		starterTemplates.value = await getStarterTemplates();
	} catch {
		starterTemplates.value = [];
	}
};

const fetchContacts = async () => {
	contactLoading.value = true;
	const result = await getContacts({
		search: search.value || undefined,
		limit,
		page: page.value,
	});
	contacts.value = result.data;
	contactTotal.value = result.total;
	contactLoading.value = false;
};

const fetchLists = async () => {
	listsLoading.value = true;
	lists.value = await getLists();
	listsLoading.value = false;
};

const debouncedFetch = useDebounceFn(fetchContacts, 300);

const handleCreateTemplate = async () => {
	if (!newTemplateName.value.trim()) return;
	creatingTemplate.value = true;
	try {
		if ((startMethod.value === 'existing' || startMethod.value === 'starter') && selectedSourceTemplate.value) {
			const tpl = await duplicateTemplate(
				selectedSourceTemplate.value.id,
				newTemplateName.value.trim(),
			);
			showNewTemplate.value = false;
			resetModal();
			await fetchTemplates();
			router.push(`/email/templates/${tpl.id}`);
		} else {
			const tpl = await createTemplate({
				name: newTemplateName.value.trim(),
				type: newTemplateType.value,
				status: 'draft',
			});
			showNewTemplate.value = false;
			resetModal();
			await fetchTemplates();
			const path = `/email/templates/${tpl.id}`;
			router.push(startMethod.value === 'ai' ? `${path}?ai=1` : path);
		}
	} catch {
		await fetchTemplates();
		showNewTemplate.value = false;
		resetModal();
	} finally {
		creatingTemplate.value = false;
	}
};

const handleDuplicate = async (tpl: any) => {
	creatingTemplate.value = true;
	try {
		const newTpl = await duplicateTemplate(tpl.id);
		await fetchTemplates();
		router.push(`/email/templates/${newTpl.id}`);
	} finally {
		creatingTemplate.value = false;
	}
};

function resetModal() {
	newTemplateName.value = '';
	startMethod.value = null;
	selectedSourceTemplate.value = null;
	newTemplateType.value = 'newsletter';
}

onMounted(async () => {
	setEntity('email', 'dashboard', 'Email Dashboard');
	await Promise.all([fetchTemplates(), fetchStarterTemplates(), fetchContacts(), fetchLists()]);
});

onUnmounted(() => clearEntity());
</script>

<template>
	<div class="p-4 md:p-6 max-w-7xl mx-auto">
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-2xl font-semibold">Email</h1>
				<p class="text-xs text-muted-foreground mt-0.5">Templates, lists, and contacts</p>
			</div>
			<div class="flex items-center gap-2">
				<button
					class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1.5 transition-colors"
					@click="sidebarOpen = true"
				>
					<Icon name="lucide:sparkles" class="w-3 h-3" />
					<span class="hidden sm:inline">Ask Earnest</span>
				</button>
				<NuxtLink to="/contacts/import">
					<button class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1.5 transition-colors">
						<Icon name="lucide:upload" class="w-3 h-3" />
						Import CSV
					</button>
				</NuxtLink>
				<button
					class="rounded-full px-3 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press inline-flex items-center gap-1.5 shadow-sm transition-colors"
					@click="showNewTemplate = true; startMethod = null"
				>
					<Icon name="lucide:plus" class="w-3 h-3" />
					New Email
				</button>
			</div>
		</div>

		<!-- Tabs -->
		<UTabs v-model="activeTab" :items="tabs" class="mb-6" />

		<!-- Templates Tab -->
		<div v-if="tabs[activeTab]?.key === 'templates'">
			<div v-if="templatesLoading" class="py-8 text-center text-muted-foreground text-sm">Loading templates...</div>
			<div v-else-if="templates.length === 0" class="py-16 text-center">
				<div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/5 flex items-center justify-center">
					<Icon name="lucide:mail-plus" class="w-7 h-7 text-primary/40" />
				</div>
				<h3 class="font-semibold text-foreground mb-1">No email templates yet</h3>
				<p class="text-xs text-muted-foreground mb-4">Create your first email template to start sending campaigns</p>
				<button
					class="rounded-full px-4 py-2 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press inline-flex items-center gap-1.5 shadow-sm"
					@click="showNewTemplate = true; startMethod = null"
				>
					<Icon name="lucide:plus" class="w-3.5 h-3.5" />
					Create Template
				</button>
			</div>
			<div v-else class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
				<div
					v-for="tpl in templates"
					:key="tpl.id"
					class="ios-card p-4 cursor-pointer group"
					@click="router.push(`/email/templates/${tpl.id}`)"
				>
					<div class="flex items-start justify-between mb-3">
						<div class="w-9 h-9 rounded-xl flex items-center justify-center" :class="tpl.type === 'newsletter' ? 'bg-primary/5' : 'bg-blue-500/5'">
							<Icon :name="tpl.type === 'newsletter' ? 'lucide:newspaper' : 'lucide:mail'" class="w-4 h-4" :class="tpl.type === 'newsletter' ? 'text-primary/60' : 'text-blue-500/60'" />
						</div>
						<span
							class="text-[10px] px-2 py-0.5 rounded-full font-medium"
							:class="{
								'bg-green-500/10 text-green-600': tpl.status === 'published',
								'bg-amber-500/10 text-amber-600': tpl.status === 'draft',
								'bg-muted text-muted-foreground': !tpl.status || tpl.status === 'archived',
							}"
						>
							{{ tpl.status || 'draft' }}
						</span>
					</div>
					<h3 class="text-sm font-semibold text-foreground mb-0.5 group-hover:text-primary transition-colors">{{ tpl.name }}</h3>
					<p class="text-[10px] text-muted-foreground capitalize">{{ tpl.type || 'newsletter' }}</p>
					<!-- Hover actions -->
					<div class="flex gap-1 mt-3 pt-2 border-t border-border/30 opacity-0 group-hover:opacity-100 transition-opacity">
						<button
							class="rounded-full px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted ios-press inline-flex items-center gap-1 transition-colors"
							@click.stop="handleDuplicate(tpl)"
						>
							<Icon name="lucide:copy" class="w-3 h-3" /> Duplicate
						</button>
						<button
							class="rounded-full px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted ios-press inline-flex items-center gap-1 transition-colors"
							@click.stop="router.push(`/email/templates/${tpl.id}`)"
						>
							<Icon name="lucide:pencil" class="w-3 h-3" /> Edit
						</button>
					</div>
				</div>

				<!-- New template card -->
				<button
					class="ios-card border-dashed border-2 p-4 flex flex-col items-center justify-center text-muted-foreground hover:text-primary min-h-[140px] cursor-pointer transition-colors"
					@click="showNewTemplate = true; startMethod = null"
				>
					<Icon name="lucide:plus" class="w-5 h-5 mb-2" />
					<span class="text-[11px] font-medium">New Template</span>
				</button>
			</div>
		</div>

		<!-- Lists Tab -->
		<div v-if="tabs[activeTab]?.key === 'lists'">
			<div class="flex justify-end mb-4">
				<NuxtLink to="/lists">
					<button class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1.5 transition-colors">
						Manage Lists
					</button>
				</NuxtLink>
			</div>

			<div v-if="listsLoading" class="py-8 text-center text-muted-foreground text-sm">Loading lists...</div>
			<div v-else-if="lists.length === 0" class="py-16 text-center">
				<div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-500/5 flex items-center justify-center">
					<Icon name="lucide:list" class="w-7 h-7 text-blue-400/40" />
				</div>
				<h3 class="font-semibold text-foreground mb-1">No mailing lists yet</h3>
				<p class="text-xs text-muted-foreground mb-4">Create a mailing list to organize your contacts</p>
				<NuxtLink to="/lists">
					<button class="rounded-full px-4 py-2 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1.5 transition-colors">
						Create Mailing List
					</button>
				</NuxtLink>
			</div>
			<div v-else class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
				<div
					v-for="list in lists"
					:key="list.id"
					class="ios-card p-4 cursor-pointer group"
					@click="router.push(`/lists/${list.id}`)"
				>
					<div class="flex items-center gap-3 mb-2">
						<div class="w-9 h-9 rounded-xl bg-blue-500/5 flex items-center justify-center">
							<Icon name="lucide:users" class="w-4 h-4 text-blue-500/60" />
						</div>
						<div class="flex-1 min-w-0">
							<h3 class="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{{ list.name }}</h3>
							<p class="text-[10px] text-muted-foreground">{{ list.subscriber_count || 0 }} subscribers</p>
						</div>
					</div>
					<p v-if="list.description" class="text-xs text-muted-foreground line-clamp-2">{{ list.description }}</p>
					<div v-if="list.double_opt_in" class="mt-2">
						<span class="text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full font-medium">Double opt-in</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Contacts Tab -->
		<div v-if="tabs[activeTab]?.key === 'contacts'">
			<div class="flex gap-3 mb-4">
				<div class="relative flex-1 min-w-48">
					<Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
					<input
						v-model="search"
						type="search"
						placeholder="Search name, email, company..."
						class="w-full rounded-full border bg-muted/30 pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
						@input="debouncedFetch"
					/>
				</div>
				<NuxtLink to="/contacts">
					<button class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1.5 transition-colors">
						Full Contact Manager
					</button>
				</NuxtLink>
			</div>

			<div v-if="contactLoading" class="py-8 text-center text-muted-foreground text-sm">Loading contacts...</div>
			<div v-else-if="contacts.length === 0" class="py-12 text-center">
				<Icon name="lucide:users" class="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
				<p class="text-sm text-muted-foreground">No contacts yet</p>
				<NuxtLink to="/contacts" class="text-primary text-xs hover:underline mt-2 inline-block">Go to Contact Manager</NuxtLink>
			</div>
			<div v-else class="ios-card overflow-hidden">
				<table class="w-full text-xs">
					<thead class="bg-muted/30">
						<tr>
							<th class="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
							<th class="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
							<th class="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Company</th>
							<th class="text-left px-4 py-2.5 font-medium text-muted-foreground hidden lg:table-cell">Status</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border/40">
						<tr
							v-for="contact in contacts"
							:key="contact.id"
							class="hover:bg-muted/20 cursor-pointer transition-colors"
							@click="router.push(`/contacts/${contact.id}`)"
						>
							<td class="px-4 py-2.5 text-foreground">{{ contact.first_name }} {{ contact.last_name }}</td>
							<td class="px-4 py-2.5 text-muted-foreground">{{ contact.email }}</td>
							<td class="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{{ contact.company || '-' }}</td>
							<td class="px-4 py-2.5 hidden lg:table-cell">
								<span
									class="text-[10px] px-2 py-0.5 rounded-full font-medium"
									:class="{
										'bg-green-500/10 text-green-600': contact.status === 'active' || contact.status === 'published',
										'bg-red-500/10 text-red-600': contact.status === 'unsubscribed' || contact.status === 'bounced',
										'bg-muted text-muted-foreground': !contact.status,
									}"
								>
									{{ contact.status || 'active' }}
								</span>
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div v-if="contacts.length > 0" class="flex justify-between items-center mt-4">
				<p class="text-[11px] text-muted-foreground">Showing {{ contacts.length }} of {{ contactTotal }}</p>
				<div class="flex gap-1.5">
					<button
						class="rounded-full px-3 py-1.5 text-[10px] font-medium border border-border bg-card hover:bg-muted ios-press transition-colors disabled:opacity-40"
						:disabled="page === 1"
						@click="page--; fetchContacts()"
					>
						Prev
					</button>
					<button
						class="rounded-full px-3 py-1.5 text-[10px] font-medium border border-border bg-card hover:bg-muted ios-press transition-colors disabled:opacity-40"
						:disabled="!hasMore"
						@click="page++; fetchContacts()"
					>
						Next
					</button>
				</div>
			</div>
		</div>

		<!-- New Template Modal -->
		<Teleport to="body">
			<div v-if="showNewTemplate" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" @click.self="showNewTemplate = false; resetModal()">
				<div class="ios-card w-full max-w-md mx-4 shadow-xl overflow-hidden">
					<!-- Modal header -->
					<div class="flex items-center justify-between px-5 py-4 border-b border-border/30">
						<div class="flex items-center gap-2">
							<button v-if="startMethod" class="p-1 rounded-full hover:bg-muted ios-press text-muted-foreground" @click="startMethod = null; selectedSourceTemplate = null">
								<Icon name="lucide:arrow-left" class="w-3.5 h-3.5" />
							</button>
							<h2 class="text-sm font-semibold text-foreground">
								{{ !startMethod ? 'Create Email' : startMethod === 'existing' ? 'From Existing' : startMethod === 'starter' ? 'Start from Template' : startMethod === 'ai' ? 'AI Generate' : 'New Template' }}
							</h2>
						</div>
						<button class="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted ios-press transition-colors" @click="showNewTemplate = false; resetModal()">
							<Icon name="lucide:x" class="w-3.5 h-3.5" />
						</button>
					</div>

					<!-- Step 1: Choose method -->
					<div v-if="!startMethod" class="p-2">
						<div class="ios-group">
							<button
								class="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-muted/30 transition-colors ios-press"
								@click="startMethod = 'blank'"
							>
								<div class="w-8 h-8 rounded-xl bg-muted flex items-center justify-center">
									<Icon name="lucide:file-plus" class="w-4 h-4 text-muted-foreground" />
								</div>
								<div class="flex-1">
									<p class="text-sm font-medium text-foreground">Blank Template</p>
									<p class="text-[11px] text-muted-foreground">Start from scratch</p>
								</div>
								<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40" />
							</button>
							<button
								v-if="starterTemplates.length > 0"
								class="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-muted/30 transition-colors ios-press"
								@click="startMethod = 'starter'"
							>
								<div class="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
									<Icon name="lucide:layout-template" class="w-4 h-4 text-emerald-500" />
								</div>
								<div class="flex-1">
									<p class="text-sm font-medium text-foreground">Start from Template</p>
									<p class="text-[11px] text-muted-foreground">{{ starterTemplates.length }} pre-built {{ starterTemplates.length === 1 ? 'design' : 'designs' }}</p>
								</div>
								<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40" />
							</button>
							<button
								class="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-muted/30 transition-colors ios-press"
								:disabled="templates.length === 0"
								:class="{ 'opacity-40': templates.length === 0 }"
								@click="startMethod = 'existing'"
							>
								<div class="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
									<Icon name="lucide:copy" class="w-4 h-4 text-blue-500" />
								</div>
								<div class="flex-1">
									<p class="text-sm font-medium text-foreground">From Existing</p>
									<p class="text-[11px] text-muted-foreground">Duplicate &amp; customize a template</p>
								</div>
								<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40" />
							</button>
							<button
								class="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-muted/30 transition-colors ios-press"
								@click="startMethod = 'ai'"
							>
								<div class="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
									<Icon name="lucide:sparkles" class="w-4 h-4 text-violet-500" />
								</div>
								<div class="flex-1">
									<p class="text-sm font-medium text-foreground">AI Generate</p>
									<p class="text-[11px] text-muted-foreground">Describe your email, AI builds it</p>
								</div>
								<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40" />
							</button>
						</div>
					</div>

					<!-- Step 2: Blank / AI — name + type -->
					<div v-else-if="startMethod === 'blank' || startMethod === 'ai'" class="px-5 py-4 space-y-4">
						<div>
							<label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Template Name</label>
							<input
								v-model="newTemplateName"
								type="text"
								placeholder="e.g. March Newsletter, Welcome Email..."
								class="w-full rounded-xl border bg-background px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all"
								@keyup.enter="handleCreateTemplate"
							/>
						</div>
						<div>
							<label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Type</label>
							<div class="bg-muted/40 rounded-full p-0.5 flex gap-0.5 w-fit">
								<button
									class="rounded-full px-3.5 py-1.5 text-[11px] font-medium transition-all"
									:class="newTemplateType === 'newsletter' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'"
									@click="newTemplateType = 'newsletter'"
								>
									Newsletter
								</button>
								<button
									class="rounded-full px-3.5 py-1.5 text-[11px] font-medium transition-all"
									:class="newTemplateType === 'transactional' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'"
									@click="newTemplateType = 'transactional'"
								>
									Transactional
								</button>
							</div>
						</div>
						<div class="flex justify-end gap-2 pt-2">
							<button class="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted ios-press transition-colors" @click="showNewTemplate = false; resetModal()">
								Cancel
							</button>
							<button
								class="rounded-full px-4 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5 disabled:opacity-40"
								:disabled="!newTemplateName.trim() || creatingTemplate"
								@click="handleCreateTemplate"
							>
								<Icon v-if="startMethod === 'ai'" name="lucide:sparkles" class="w-3 h-3" />
								{{ creatingTemplate ? 'Creating...' : startMethod === 'ai' ? 'Create & Generate' : 'Create' }}
							</button>
						</div>
					</div>

					<!-- Step 2: Starter Template picker -->
					<div v-else-if="startMethod === 'starter'" class="space-y-0">
						<div class="max-h-64 overflow-y-auto divide-y divide-border/30">
							<button
								v-for="tpl in starterTemplates"
								:key="tpl.id"
								class="flex items-center gap-3 w-full px-5 py-3 text-left hover:bg-muted/30 transition-colors ios-press"
								:class="{ 'bg-primary/5': selectedSourceTemplate?.id === tpl.id }"
								@click="selectedSourceTemplate = tpl; newTemplateName = tpl.name"
							>
								<div class="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
									<Icon name="lucide:layout-template" class="w-3.5 h-3.5 text-emerald-500" />
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-foreground truncate">{{ tpl.name }}</p>
									<p class="text-[10px] text-muted-foreground capitalize">{{ tpl.block_count || 0 }} blocks · {{ tpl.type }}</p>
								</div>
								<Icon v-if="selectedSourceTemplate?.id === tpl.id" name="lucide:check" class="w-4 h-4 text-primary" />
							</button>
						</div>
						<div v-if="selectedSourceTemplate" class="px-5 py-3 border-t border-border/30 space-y-3">
							<div>
								<label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Name Your Copy</label>
								<input
									v-model="newTemplateName"
									type="text"
									class="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all"
									@keyup.enter="handleCreateTemplate"
								/>
							</div>
							<div class="flex justify-end">
								<button
									class="rounded-full px-4 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5 disabled:opacity-40"
									:disabled="!newTemplateName.trim() || creatingTemplate"
									@click="handleCreateTemplate"
								>
									<Icon name="lucide:layout-template" class="w-3 h-3" />
									{{ creatingTemplate ? 'Creating...' : 'Use Template' }}
								</button>
							</div>
						</div>
					</div>

					<!-- Step 2: From Existing — template picker -->
					<div v-else-if="startMethod === 'existing'" class="space-y-0">
						<div class="max-h-64 overflow-y-auto divide-y divide-border/30">
							<button
								v-for="tpl in templates"
								:key="tpl.id"
								class="flex items-center gap-3 w-full px-5 py-3 text-left hover:bg-muted/30 transition-colors ios-press"
								:class="{ 'bg-primary/5': selectedSourceTemplate?.id === tpl.id }"
								@click="selectedSourceTemplate = tpl; newTemplateName = `${tpl.name} (Copy)`"
							>
								<div class="w-7 h-7 rounded-lg flex items-center justify-center" :class="tpl.type === 'newsletter' ? 'bg-primary/5' : 'bg-blue-500/5'">
									<Icon :name="tpl.type === 'newsletter' ? 'lucide:newspaper' : 'lucide:mail'" class="w-3.5 h-3.5" :class="tpl.type === 'newsletter' ? 'text-primary/60' : 'text-blue-500/60'" />
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-foreground truncate">{{ tpl.name }}</p>
									<p class="text-[10px] text-muted-foreground capitalize">{{ tpl.type }}</p>
								</div>
								<Icon v-if="selectedSourceTemplate?.id === tpl.id" name="lucide:check" class="w-4 h-4 text-primary" />
							</button>
						</div>
						<div v-if="selectedSourceTemplate" class="px-5 py-3 border-t border-border/30 space-y-3">
							<div>
								<label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">New Name</label>
								<input
									v-model="newTemplateName"
									type="text"
									class="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all"
									@keyup.enter="handleCreateTemplate"
								/>
							</div>
							<div class="flex justify-end">
								<button
									class="rounded-full px-4 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5 disabled:opacity-40"
									:disabled="!newTemplateName.trim() || creatingTemplate"
									@click="handleCreateTemplate"
								>
									<Icon name="lucide:copy" class="w-3 h-3" />
									{{ creatingTemplate ? 'Duplicating...' : 'Duplicate' }}
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</Teleport>

		<!-- AI Contextual Sidebar -->
		<ClientOnly>
			<AIContextualSidebar
				v-if="sidebarOpen"
				entity-type="email"
				entity-id="dashboard"
				entity-label="Email Dashboard"
				@close="closeSidebar"
			/>
			<Transition name="overlay">
				<div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
			</Transition>
		</ClientOnly>
	</div>
</template>

<style scoped>
.overlay-enter-active,
.overlay-leave-active {
	transition: opacity 0.3s ease;
}
.overlay-enter-from,
.overlay-leave-to {
	opacity: 0;
}
</style>
