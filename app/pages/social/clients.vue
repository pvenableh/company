<script setup lang="ts">
/**
 * Contact Management Page
 * /social/contacts
 *
 * Manage agency contacts and assign social accounts
 */

import type { SocialClient, SocialAccountPublic } from '~~/shared/social'

definePageMeta({
  layout: 'default',
  middleware: ['auth'],
})
useHead({ title: 'Social Clients | Earnest' })

const toast = useToast()

// Fetch data (lazy to avoid blocking page render on Directus errors)
const { data: contactsData, refresh: refreshContacts } = useLazyFetch('/api/social/clients')
const { data: accountsData, refresh: refreshAccounts } = useLazyFetch('/api/social/accounts')

const contacts = computed(() => ((contactsData.value as any)?.data || []) as (SocialClient & { account_count: number })[])
const accounts = computed(() => ((accountsData.value as any)?.data || []) as SocialAccountPublic[])
const unassignedAccounts = computed(() => accounts.value.filter((a) => !a.client_id))

// UI State
const showNewContactModal = ref(false)
const showEditContactModal = ref(false)
const showAssignAccountsModal = ref(false)
const selectedContact = ref<SocialClient | null>(null)
const isLoading = ref(false)

// Form state
const newContactForm = ref({
  name: '',
  contact_email: '',
  brand_color: '#3b82f6',
})

const editContactForm = ref({
  name: '',
  contact_email: '',
  brand_color: '',
})

// Methods
function openEditModal(contact: SocialClient) {
  selectedContact.value = contact
  editContactForm.value = {
    name: contact.name,
    contact_email: contact.contact_email || '',
    brand_color: contact.brand_color || '#3b82f6',
  }
  showEditContactModal.value = true
}

function openAssignModal(contact: SocialClient) {
  selectedContact.value = contact
  showAssignAccountsModal.value = true
}

async function createContact() {
  if (!newContactForm.value.name.trim()) return

  isLoading.value = true
  try {
    await $fetch('/api/social/clients', {
      method: 'POST',
      body: newContactForm.value,
    })

    toast.add({ title: 'Contact created', icon: 'i-lucide-check-circle', color: 'green' })
    await refreshContacts()
    showNewContactModal.value = false
    newContactForm.value = { name: '', contact_email: '', brand_color: '#3b82f6' }
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.data?.message || 'Failed to create contact', icon: 'i-lucide-alert-circle', color: 'red' })
  } finally {
    isLoading.value = false
  }
}

async function updateContact() {
  if (!selectedContact.value || !editContactForm.value.name.trim()) return

  isLoading.value = true
  try {
    await $fetch(`/api/social/clients/${selectedContact.value.id}`, {
      method: 'PATCH',
      body: editContactForm.value,
    })

    toast.add({ title: 'Contact updated', icon: 'i-lucide-check-circle', color: 'green' })
    await refreshContacts()
    showEditContactModal.value = false
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.data?.message || 'Failed to update contact', icon: 'i-lucide-alert-circle', color: 'red' })
  } finally {
    isLoading.value = false
  }
}

async function deleteContact(contact: SocialClient) {
  if (!confirm(`Delete "${contact.name}"? Accounts will be unassigned but not deleted.`)) return

  try {
    await $fetch(`/api/social/clients/${contact.id}`, { method: 'DELETE' })
    toast.add({ title: 'Contact deleted', icon: 'i-lucide-check-circle', color: 'green' })
    await refreshContacts()
    await refreshAccounts()
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.data?.message || 'Failed to delete contact', icon: 'i-lucide-alert-circle', color: 'red' })
  }
}

async function assignAccountToClient(accountId: string, clientId: string | null) {
  try {
    await $fetch(`/api/social/accounts/${accountId}`, {
      method: 'PATCH',
      body: { client_id: clientId },
    })
    await refreshAccounts()
    await refreshContacts()
  } catch (error: any) {
    toast.add({ title: 'Error', description: 'Failed to assign account', icon: 'i-lucide-alert-circle', color: 'red' })
  }
}

function getContactAccounts(contactId: string) {
  return accounts.value.filter((a) => a.client_id === contactId)
}
</script>

<template>
  <LayoutPageContainer>
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div class="flex items-center gap-4">
        <UButton to="/social" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Social Accounts</h1>
          <p class="text-gray-500 dark:text-gray-400 mt-0.5">Organize clients and assign social media accounts</p>
        </div>
      </div>
      <UButton icon="i-lucide-plus" @click="showNewContactModal = true">New Contact</UButton>
    </div>

    <!-- Contacts Grid -->
    <div v-if="contacts.length === 0" class="text-center py-16">
      <UIcon name="i-lucide-building-2" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No contacts yet</h3>
      <p class="text-gray-500 dark:text-gray-400 mb-6">Create your first contact to organize social accounts</p>
      <UButton @click="showNewContactModal = true">Create Contact</UButton>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <UCard v-for="contact in contacts" :key="contact.id" class="relative">
        <!-- Color bar -->
        <div
          v-if="contact.brand_color"
          class="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
          :style="{ backgroundColor: contact.brand_color }"
        />

        <template #header>
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <UAvatar
                v-if="contact.logo_url"
                :src="contact.logo_url"
                :alt="contact.name"
                size="md"
              />
              <div
                v-else
                class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                :style="{ backgroundColor: contact.brand_color || '#6b7280' }"
              >
                {{ contact.name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">{{ contact.name }}</h3>
                <p v-if="contact.contact_email" class="text-xs text-gray-500 dark:text-gray-400">
                  {{ contact.contact_email }}
                </p>
              </div>
            </div>
            <UDropdown
              :items="[
                [{ label: 'Edit', icon: 'i-lucide-edit', click: () => openEditModal(contact) }],
                [{ label: 'Assign Accounts', icon: 'i-lucide-link', click: () => openAssignModal(contact) }],
                [{ label: 'Delete', icon: 'i-lucide-trash-2', click: () => deleteContact(contact) }],
              ]"
            >
              <UButton variant="ghost" icon="i-lucide-more-vertical" size="xs" />
            </UDropdown>
          </div>
        </template>

        <!-- Account Count -->
        <div class="mb-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ contact.account_count }} account{{ contact.account_count !== 1 ? 's' : '' }}
          </p>
        </div>

        <!-- Account Avatars -->
        <div class="flex -space-x-2">
          <UAvatar
            v-for="account in getContactAccounts(contact.id).slice(0, 5)"
            :key="account.id"
            :src="account.profile_picture_url || undefined"
            :alt="account.account_name"
            size="sm"
            class="ring-2 ring-white dark:ring-gray-900"
          />
          <div
            v-if="getContactAccounts(contact.id).length > 5"
            class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium ring-2 ring-white dark:ring-gray-900"
          >
            +{{ getContactAccounts(contact.id).length - 5 }}
          </div>
        </div>

        <template #footer>
          <div class="flex gap-2">
            <UButton variant="soft" size="xs" icon="i-lucide-link" @click="openAssignModal(contact)">
              Assign Accounts
            </UButton>
          </div>
        </template>
      </UCard>
    </div>

    <!-- Unassigned Accounts Section -->
    <div v-if="unassignedAccounts.length > 0" class="mt-8">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Unassigned Accounts</h2>
      <UCard>
        <div class="divide-y divide-gray-100 dark:divide-gray-800">
          <div v-for="account in unassignedAccounts" :key="account.id" class="flex items-center gap-4 py-3">
            <UAvatar :src="account.profile_picture_url || undefined" :alt="account.account_name" size="sm" />
            <div class="flex-1">
              <p class="font-medium text-gray-900 dark:text-white">{{ account.account_name }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <UIcon :name="account.platform === 'instagram' ? 'i-lucide-instagram' : 'i-lucide-music'" class="w-3 h-3" />
                @{{ account.account_handle }}
              </p>
            </div>
            <USelectMenu
              :model-value="null"
              :options="[{ label: 'Select contact...', value: null }, ...contacts.map((c) => ({ label: c.name, value: c.id }))]"
              value-attribute="value"
              option-attribute="label"
              placeholder="Assign to..."
              size="sm"
              class="w-40"
              @update:model-value="(val) => val && assignAccountToClient(account.id, val)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <!-- New Contact Modal -->
    <UModal v-model="showNewContactModal">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">New Contact</h3>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Name" required>
            <UInput v-model="newContactForm.name" placeholder="Contact name" />
          </UFormGroup>
          <UFormGroup label="Contact Email">
            <UInput v-model="newContactForm.contact_email" type="email" placeholder="email@example.com" />
          </UFormGroup>
          <UFormGroup label="Brand Color">
            <div class="flex items-center gap-3">
              <input type="color" v-model="newContactForm.brand_color" class="w-10 h-10 rounded cursor-pointer" />
              <UInput v-model="newContactForm.brand_color" class="flex-1" />
            </div>
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton variant="ghost" @click="showNewContactModal = false">Cancel</UButton>
            <UButton @click="createContact" :loading="isLoading" :disabled="!newContactForm.name.trim()">Create</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Edit Contact Modal -->
    <UModal v-model="showEditContactModal">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">Edit Contact</h3>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Name" required>
            <UInput v-model="editContactForm.name" placeholder="Contact name" />
          </UFormGroup>
          <UFormGroup label="Contact Email">
            <UInput v-model="editContactForm.contact_email" type="email" placeholder="email@example.com" />
          </UFormGroup>
          <UFormGroup label="Brand Color">
            <div class="flex items-center gap-3">
              <input type="color" v-model="editContactForm.brand_color" class="w-10 h-10 rounded cursor-pointer" />
              <UInput v-model="editContactForm.brand_color" class="flex-1" />
            </div>
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton variant="ghost" @click="showEditContactModal = false">Cancel</UButton>
            <UButton @click="updateContact" :loading="isLoading" :disabled="!editContactForm.name.trim()">Save</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Assign Accounts Modal -->
    <UModal v-model="showAssignAccountsModal">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">
            Assign Accounts to {{ selectedContact?.name }}
          </h3>
        </template>

        <div class="space-y-2 max-h-[400px] overflow-y-auto">
          <div
            v-for="account in accounts"
            :key="account.id"
            class="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div class="flex items-center gap-3">
              <UAvatar :src="account.profile_picture_url || undefined" :alt="account.account_name" size="sm" />
              <div>
                <p class="font-medium text-gray-900 dark:text-white">{{ account.account_name }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  <UIcon :name="account.platform === 'instagram' ? 'i-lucide-instagram' : 'i-lucide-music'" class="w-3 h-3 inline" />
                  @{{ account.account_handle }}
                  <span v-if="account.client_name && account.client_id !== selectedContact?.id" class="ml-2 text-amber-500">
                    ({{ account.client_name }})
                  </span>
                </p>
              </div>
            </div>
            <UButton
              v-if="account.client_id === selectedContact?.id"
              variant="soft"
              color="red"
              size="xs"
              @click="assignAccountToClient(account.id, null)"
            >
              Remove
            </UButton>
            <UButton
              v-else
              variant="soft"
              size="xs"
              @click="assignAccountToClient(account.id, selectedContact?.id || null)"
            >
              Assign
            </UButton>
          </div>
        </div>

        <template #footer>
          <UButton block variant="ghost" @click="showAssignAccountsModal = false">Done</UButton>
        </template>
      </UCard>
    </UModal>
  </LayoutPageContainer>
</template>
