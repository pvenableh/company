<script setup lang="ts">
import type { Contact } from '~~/types/email/contacts';
import { Button } from '~/components/ui/button';
import { useDebounceFn } from '@vueuse/core';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Email | Earnest' });

const router = useRouter();
const { getContacts } = useContacts();
const { getLists } = useMailingLists();
const { getTemplates, createTemplate } = useEmailTemplates();

const tab = ref<'templates' | 'lists' | 'contacts'>('templates');

// Templates state
const templates = ref<any[]>([]);
const templatesLoading = ref(true);

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
const useAIAssist = ref(true);
const creatingTemplate = ref(false);

const fetchTemplates = async () => {
	templatesLoading.value = true;
	try {
		templates.value = await getTemplates();
	} catch {
		templates.value = [];
	}
	templatesLoading.value = false;
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
		const tpl = await createTemplate({
			name: newTemplateName.value.trim(),
			type: newTemplateType.value,
			status: 'draft',
		});
		showNewTemplate.value = false;
		newTemplateName.value = '';
		await fetchTemplates();
		const path = `/email/templates/${tpl.id}`;
		router.push(useAIAssist.value ? `${path}?ai=1` : path);
	} catch {
		await fetchTemplates();
		showNewTemplate.value = false;
	} finally {
		creatingTemplate.value = false;
	}
};

onMounted(async () => {
	await Promise.all([fetchTemplates(), fetchContacts(), fetchLists()]);
});
</script>

<template>
	<div class="p-6 max-w-7xl mx-auto">
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-xl font-semibold">Email</h1>
				<p class="text-sm text-muted-foreground">Create campaigns, manage templates and mailing lists</p>
			</div>
			<div class="flex gap-2">
				<NuxtLink to="/contacts/import">
					<Button variant="outline" size="sm">
						<Icon name="lucide:upload" class="w-4 h-4 mr-1" />
						Import CSV
					</Button>
				</NuxtLink>
				<Button size="sm" @click="showNewTemplate = true">
					<Icon name="lucide:plus" class="w-4 h-4 mr-1" />
					New Email
				</Button>
			</div>
		</div>

		<!-- Tabs -->
		<div class="flex gap-1 mb-6 border-b">
			<button
				class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
				:class="tab === 'templates' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
				@click="tab = 'templates'"
			>
				Templates ({{ templates.length }})
			</button>
			<button
				class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
				:class="tab === 'lists' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
				@click="tab = 'lists'"
			>
				Mailing Lists ({{ lists.length }})
			</button>
			<button
				class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
				:class="tab === 'contacts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
				@click="tab = 'contacts'"
			>
				Contacts ({{ contactTotal }})
			</button>
		</div>

		<!-- Templates Tab -->
		<div v-if="tab === 'templates'">
			<div v-if="templatesLoading" class="py-8 text-center text-muted-foreground">Loading templates...</div>
			<div v-else-if="templates.length === 0" class="py-16 text-center">
				<div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center">
					<Icon name="lucide:mail-plus" class="w-8 h-8 text-rose-400" />
				</div>
				<h3 class="font-semibold text-foreground mb-1">No email templates yet</h3>
				<p class="text-sm text-muted-foreground mb-4">Create your first email template to start sending campaigns</p>
				<Button @click="showNewTemplate = true">
					<Icon name="lucide:plus" class="w-4 h-4 mr-1" />
					Create Template
				</Button>
			</div>
			<div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				<div
					v-for="tpl in templates"
					:key="tpl.id"
					class="group border rounded-xl p-5 hover:border-primary/30 hover:shadow-sm cursor-pointer transition-all"
					@click="router.push(`/email/templates/${tpl.id}`)"
				>
					<div class="flex items-start justify-between mb-3">
						<div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="tpl.type === 'newsletter' ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-blue-50 dark:bg-blue-900/20'">
							<Icon :name="tpl.type === 'newsletter' ? 'lucide:newspaper' : 'lucide:mail'" class="w-5 h-5" :class="tpl.type === 'newsletter' ? 'text-rose-500' : 'text-blue-500'" />
						</div>
						<span
							class="text-xs px-2 py-0.5 rounded-full"
							:class="{
								'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': tpl.status === 'published',
								'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': tpl.status === 'draft',
								'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400': !tpl.status || tpl.status === 'archived',
							}"
						>
							{{ tpl.status || 'draft' }}
						</span>
					</div>
					<h3 class="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">{{ tpl.name }}</h3>
					<p class="text-xs text-muted-foreground capitalize">{{ tpl.type || 'newsletter' }}</p>
				</div>

				<!-- New template card -->
				<button
					class="border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-primary transition-all min-h-[140px]"
					@click="showNewTemplate = true"
				>
					<Icon name="lucide:plus" class="w-6 h-6 mb-2" />
					<span class="text-sm font-medium">New Template</span>
				</button>
			</div>
		</div>

		<!-- Lists Tab -->
		<div v-if="tab === 'lists'">
			<div class="flex justify-end mb-4">
				<NuxtLink to="/lists">
					<Button variant="outline" size="sm">Manage Lists</Button>
				</NuxtLink>
			</div>

			<div v-if="listsLoading" class="py-8 text-center text-muted-foreground">Loading lists...</div>
			<div v-else-if="lists.length === 0" class="py-16 text-center">
				<div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
					<Icon name="lucide:list" class="w-8 h-8 text-blue-400" />
				</div>
				<h3 class="font-semibold text-foreground mb-1">No mailing lists yet</h3>
				<p class="text-sm text-muted-foreground mb-4">Create a mailing list to organize your contacts for campaigns</p>
				<NuxtLink to="/lists">
					<Button variant="outline">Create Mailing List</Button>
				</NuxtLink>
			</div>
			<div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				<div
					v-for="list in lists"
					:key="list.id"
					class="border rounded-xl p-5 hover:border-primary/30 hover:shadow-sm cursor-pointer transition-all"
					@click="router.push(`/lists/${list.id}`)"
				>
					<div class="flex items-center gap-3 mb-3">
						<div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
							<Icon name="lucide:users" class="w-5 h-5 text-blue-500" />
						</div>
						<div class="flex-1 min-w-0">
							<h3 class="font-semibold text-foreground truncate">{{ list.name }}</h3>
							<p class="text-xs text-muted-foreground">{{ list.subscriber_count || 0 }} subscribers</p>
						</div>
					</div>
					<p v-if="list.description" class="text-sm text-muted-foreground line-clamp-2">{{ list.description }}</p>
					<div v-if="list.double_opt_in" class="mt-2">
						<span class="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">Double opt-in</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Contacts Tab -->
		<div v-if="tab === 'contacts'">
			<div class="flex gap-3 mb-4">
				<input
					v-model="search"
					type="search"
					placeholder="Search name, email, company..."
					class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
					@input="debouncedFetch"
				/>
				<NuxtLink to="/contacts">
					<Button variant="outline" size="sm">Full Contact Manager</Button>
				</NuxtLink>
			</div>

			<div v-if="contactLoading" class="py-8 text-center text-muted-foreground">Loading contacts...</div>
			<div v-else-if="contacts.length === 0" class="py-12 text-center">
				<Icon name="lucide:users" class="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
				<p class="text-muted-foreground">No contacts yet</p>
				<NuxtLink to="/contacts" class="text-primary text-sm hover:underline mt-2 inline-block">Go to Contact Manager</NuxtLink>
			</div>
			<div v-else class="border rounded-lg overflow-hidden">
				<table class="w-full text-sm">
					<thead class="bg-muted/50">
						<tr>
							<th class="text-left px-4 py-2 font-medium">Name</th>
							<th class="text-left px-4 py-2 font-medium">Email</th>
							<th class="text-left px-4 py-2 font-medium hidden md:table-cell">Company</th>
							<th class="text-left px-4 py-2 font-medium hidden lg:table-cell">Status</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						<tr
							v-for="contact in contacts"
							:key="contact.id"
							class="hover:bg-muted/30 cursor-pointer transition-colors"
							@click="router.push(`/contacts/${contact.id}`)"
						>
							<td class="px-4 py-2">{{ contact.first_name }} {{ contact.last_name }}</td>
							<td class="px-4 py-2 text-muted-foreground">{{ contact.email }}</td>
							<td class="px-4 py-2 text-muted-foreground hidden md:table-cell">{{ contact.company || '-' }}</td>
							<td class="px-4 py-2 hidden lg:table-cell">
								<span
									class="text-xs px-2 py-0.5 rounded-full"
									:class="{
										'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': contact.status === 'active' || contact.status === 'published',
										'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': contact.status === 'unsubscribed' || contact.status === 'bounced',
										'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400': !contact.status,
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
				<p class="text-sm text-muted-foreground">Showing {{ contacts.length }} of {{ contactTotal }}</p>
				<div class="flex gap-2">
					<Button variant="outline" size="sm" :disabled="page === 1" @click="page--; fetchContacts()">Prev</Button>
					<Button variant="outline" size="sm" :disabled="!hasMore" @click="page++; fetchContacts()">Next</Button>
				</div>
			</div>
		</div>

		<!-- New Template Modal -->
		<div v-if="showNewTemplate" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" @click.self="showNewTemplate = false">
			<div class="bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 border">
				<div class="flex items-center justify-between mb-5">
					<h2 class="text-lg font-semibold text-foreground">Create Email Template</h2>
					<button class="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" @click="showNewTemplate = false">
						<Icon name="lucide:x" class="w-4 h-4" />
					</button>
				</div>
				<div class="space-y-4">
					<div>
						<label class="text-sm font-medium text-foreground/80 mb-1.5 block">Template Name</label>
						<input
							v-model="newTemplateName"
							type="text"
							placeholder="e.g. March Newsletter, Welcome Email..."
							class="w-full rounded-xl border bg-background px-3 py-2.5 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
							@keyup.enter="handleCreateTemplate"
						/>
					</div>
					<div>
						<label class="text-sm font-medium text-foreground/80 mb-1.5 block">Type</label>
						<div class="grid grid-cols-2 gap-3">
							<button
								class="p-3 rounded-xl border-2 text-left transition-all"
								:class="newTemplateType === 'newsletter' ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
								@click="newTemplateType = 'newsletter'"
							>
								<Icon name="lucide:newspaper" class="w-5 h-5 mb-1" :class="newTemplateType === 'newsletter' ? 'text-primary' : 'text-muted-foreground'" />
								<p class="text-sm font-medium">Newsletter</p>
								<p class="text-xs text-muted-foreground">Campaign emails</p>
							</button>
							<button
								class="p-3 rounded-xl border-2 text-left transition-all"
								:class="newTemplateType === 'transactional' ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
								@click="newTemplateType = 'transactional'"
							>
								<Icon name="lucide:mail" class="w-5 h-5 mb-1" :class="newTemplateType === 'transactional' ? 'text-primary' : 'text-muted-foreground'" />
								<p class="text-sm font-medium">Transactional</p>
								<p class="text-xs text-muted-foreground">Automated emails</p>
							</button>
						</div>
					</div>

					<!-- AI-Assisted toggle -->
					<div class="rounded-xl border-2 border-violet-200 dark:border-violet-800/50 bg-gradient-to-r from-violet-50/50 to-pink-50/30 dark:from-violet-900/10 dark:to-pink-900/5 p-3">
						<label class="flex items-center gap-3 cursor-pointer">
							<input
								v-model="useAIAssist"
								type="checkbox"
								class="rounded border-violet-300 text-violet-600 focus:ring-violet-500/20 h-4 w-4"
							/>
							<div class="flex-1">
								<div class="flex items-center gap-1.5">
									<Icon name="lucide:sparkles" class="w-4 h-4 text-violet-500" />
									<span class="text-sm font-medium text-foreground">Start with AI</span>
								</div>
								<p class="text-xs text-muted-foreground mt-0.5">AI will help you generate content and layout</p>
							</div>
						</label>
					</div>
				</div>
				<div class="flex justify-end gap-3 mt-6">
					<Button variant="ghost" @click="showNewTemplate = false">Cancel</Button>
					<Button
						:disabled="!newTemplateName.trim() || creatingTemplate"
						:class="useAIAssist ? 'bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white border-0' : ''"
						@click="handleCreateTemplate"
					>
						<Icon v-if="useAIAssist" name="lucide:sparkles" class="w-4 h-4 mr-1" />
						{{ creatingTemplate ? 'Creating...' : useAIAssist ? 'Create & Generate' : 'Create Template' }}
					</Button>
				</div>
			</div>
		</div>
	</div>
</template>
