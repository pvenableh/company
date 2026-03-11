<script setup lang="ts">
import type { Contact } from '~/types/email/contacts';
import { Button } from '~/components/ui/button';
import { useDebounceFn } from '@vueuse/core';

definePageMeta({ middleware: ['auth'] });

const router = useRouter();
const { getContacts } = useContacts();
const { getLists } = useMailingLists();

const tab = ref<'contacts' | 'lists'>('contacts');

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

onMounted(async () => {
	await Promise.all([fetchContacts(), fetchLists()]);
});
</script>

<template>
	<div class="p-6 max-w-7xl mx-auto">
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-2xl font-bold">Email</h1>
				<p class="text-sm text-muted-foreground">Manage contacts and mailing lists</p>
			</div>
			<div class="flex gap-2">
				<NuxtLink to="/contacts/import">
					<Button variant="outline" size="sm">
						<Icon name="lucide:upload" class="w-4 h-4 mr-1" />
						Import CSV
					</Button>
				</NuxtLink>
			</div>
		</div>

		<!-- Tabs -->
		<div class="flex gap-1 mb-6 border-b">
			<button
				class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
				:class="tab === 'contacts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
				@click="tab = 'contacts'"
			>
				Contacts ({{ contactTotal }})
			</button>
			<button
				class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
				:class="tab === 'lists' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
				@click="tab = 'lists'"
			>
				Mailing Lists ({{ lists.length }})
			</button>
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

		<!-- Lists Tab -->
		<div v-if="tab === 'lists'">
			<div class="flex justify-end mb-4">
				<NuxtLink to="/lists">
					<Button variant="outline" size="sm">Manage Lists</Button>
				</NuxtLink>
			</div>

			<div v-if="listsLoading" class="py-8 text-center text-muted-foreground">Loading lists...</div>
			<div v-else-if="lists.length === 0" class="py-12 text-center">
				<Icon name="lucide:mail" class="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
				<p class="text-muted-foreground">No mailing lists yet</p>
				<NuxtLink to="/lists" class="text-primary text-sm hover:underline mt-2 inline-block">Create a mailing list</NuxtLink>
			</div>
			<div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				<div
					v-for="list in lists"
					:key="list.id"
					class="border rounded-lg p-4 hover:bg-muted/30 cursor-pointer transition-colors"
					@click="router.push(`/lists/${list.id}`)"
				>
					<div class="flex items-center gap-2 mb-2">
						<Icon name="lucide:mail" class="w-5 h-5 text-primary" />
						<h3 class="font-semibold">{{ list.name }}</h3>
					</div>
					<p v-if="list.description" class="text-sm text-muted-foreground mb-2">{{ list.description }}</p>
					<div class="flex items-center gap-3 text-xs text-muted-foreground">
						<span>{{ list.subscriber_count || 0 }} subscribers</span>
						<span v-if="list.double_opt_in" class="text-amber-500">Double opt-in</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
