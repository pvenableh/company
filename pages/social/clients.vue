<script setup lang="ts">
/**
 * Client Management Page
 * /social/clients
 *
 * Manage agency clients and assign social accounts
 */

import type { SocialClient, SocialAccountPublic } from '~/types/social'

definePageMeta({
  layout: 'default',
  middleware: ['auth'],
})

const toast = useToast()

// Fetch data (lazy to avoid blocking page render on Directus errors)
const { data: clientsData, refresh: refreshClients } = useLazyFetch('/api/social/clients')
const { data: accountsData, refresh: refreshAccounts } = useLazyFetch('/api/social/accounts')

const clients = computed(() => ((clientsData.value as any)?.data || []) as (SocialClient & { account_count: number })[])
const accounts = computed(() => ((accountsData.value as any)?.data || []) as SocialAccountPublic[])
const unassignedAccounts = computed(() => accounts.value.filter((a) => !a.client_id))

// UI State
const showNewClientModal = ref(false)
const showEditClientModal = ref(false)
const showAssignAccountsModal = ref(false)
const selectedClient = ref<SocialClient | null>(null)
const isLoading = ref(false)

// Form state
const newClientForm = ref({
  name: '',
  contact_email: '',
  brand_color: '#3b82f6',
})

const editClientForm = ref({
  name: '',
  contact_email: '',
  brand_color: '',
})

// Methods
function openEditModal(client: SocialClient) {
  selectedClient.value = client
  editClientForm.value = {
    name: client.name,
    contact_email: client.contact_email || '',
    brand_color: client.brand_color || '#3b82f6',
  }
  showEditClientModal.value = true
}

function openAssignModal(client: SocialClient) {
  selectedClient.value = client
  showAssignAccountsModal.value = true
}

async function createClient() {
  if (!newClientForm.value.name.trim()) return

  isLoading.value = true
  try {
    await $fetch('/api/social/clients', {
      method: 'POST',
      body: newClientForm.value,
    })

    toast.add({ title: 'Client created', icon: 'i-lucide-check-circle', color: 'green' })
    await refreshClients()
    showNewClientModal.value = false
    newClientForm.value = { name: '', contact_email: '', brand_color: '#3b82f6' }
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.data?.message || 'Failed to create client', icon: 'i-lucide-alert-circle', color: 'red' })
  } finally {
    isLoading.value = false
  }
}

async function updateClient() {
  if (!selectedClient.value || !editClientForm.value.name.trim()) return

  isLoading.value = true
  try {
    await $fetch(`/api/social/clients/${selectedClient.value.id}`, {
      method: 'PATCH',
      body: editClientForm.value,
    })

    toast.add({ title: 'Client updated', icon: 'i-lucide-check-circle', color: 'green' })
    await refreshClients()
    showEditClientModal.value = false
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.data?.message || 'Failed to update client', icon: 'i-lucide-alert-circle', color: 'red' })
  } finally {
    isLoading.value = false
  }
}

async function deleteClient(client: SocialClient) {
  if (!confirm(`Delete "${client.name}"? Accounts will be unassigned but not deleted.`)) return

  try {
    await $fetch(`/api/social/clients/${client.id}`, { method: 'DELETE' })
    toast.add({ title: 'Client deleted', icon: 'i-lucide-check-circle', color: 'green' })
    await refreshClients()
    await refreshAccounts()
  } catch (error: any) {
    toast.add({ title: 'Error', description: error.data?.message || 'Failed to delete client', icon: 'i-lucide-alert-circle', color: 'red' })
  }
}

async function assignAccountToClient(accountId: string, clientId: string | null) {
  try {
    await $fetch(`/api/social/accounts/${accountId}`, {
      method: 'PATCH',
      body: { client_id: clientId },
    })
    await refreshAccounts()
    await refreshClients()
  } catch (error: any) {
    toast.add({ title: 'Error', description: 'Failed to assign account', icon: 'i-lucide-alert-circle', color: 'red' })
  }
}

function getClientAccounts(clientId: string) {
  return accounts.value.filter((a) => a.client_id === clientId)
}
</script>

<template>
  <div class="p-6 lg:p-8 max-w-5xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div class="flex items-center gap-4">
        <UButton to="/social/dashboard" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Clients</h1>
          <p class="text-gray-500 dark:text-gray-400 mt-0.5">Manage clients and assign social accounts</p>
        </div>
      </div>
      <UButton icon="i-lucide-plus" @click="showNewClientModal = true">New Client</UButton>
    </div>

    <!-- Clients Grid -->
    <div v-if="clients.length === 0" class="text-center py-16">
      <UIcon name="i-lucide-building-2" class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No clients yet</h3>
      <p class="text-gray-500 dark:text-gray-400 mb-6">Create your first client to organize social accounts</p>
      <UButton @click="showNewClientModal = true">Create Client</UButton>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <UCard v-for="client in clients" :key="client.id" class="relative">
        <!-- Color bar -->
        <div
          v-if="client.brand_color"
          class="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
          :style="{ backgroundColor: client.brand_color }"
        />

        <template #header>
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <UAvatar
                v-if="client.logo_url"
                :src="client.logo_url"
                :alt="client.name"
                size="md"
              />
              <div
                v-else
                class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                :style="{ backgroundColor: client.brand_color || '#6b7280' }"
              >
                {{ client.name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">{{ client.name }}</h3>
                <p v-if="client.contact_email" class="text-xs text-gray-500 dark:text-gray-400">
                  {{ client.contact_email }}
                </p>
              </div>
            </div>
            <UDropdown
              :items="[
                [{ label: 'Edit', icon: 'i-lucide-edit', click: () => openEditModal(client) }],
                [{ label: 'Assign Accounts', icon: 'i-lucide-link', click: () => openAssignModal(client) }],
                [{ label: 'Delete', icon: 'i-lucide-trash-2', click: () => deleteClient(client) }],
              ]"
            >
              <UButton variant="ghost" icon="i-lucide-more-vertical" size="xs" />
            </UDropdown>
          </div>
        </template>

        <!-- Account Count -->
        <div class="mb-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ client.account_count }} account{{ client.account_count !== 1 ? 's' : '' }}
          </p>
        </div>

        <!-- Account Avatars -->
        <div class="flex -space-x-2">
          <UAvatar
            v-for="account in getClientAccounts(client.id).slice(0, 5)"
            :key="account.id"
            :src="account.profile_picture_url || undefined"
            :alt="account.account_name"
            size="sm"
            class="ring-2 ring-white dark:ring-gray-900"
          />
          <div
            v-if="getClientAccounts(client.id).length > 5"
            class="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium ring-2 ring-white dark:ring-gray-900"
          >
            +{{ getClientAccounts(client.id).length - 5 }}
          </div>
        </div>

        <template #footer>
          <div class="flex gap-2">
            <UButton variant="soft" size="xs" icon="i-lucide-link" @click="openAssignModal(client)">
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
              :options="[{ label: 'Select client...', value: null }, ...clients.map((c) => ({ label: c.name, value: c.id }))]"
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

    <!-- New Client Modal -->
    <UModal v-model="showNewClientModal">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">New Client</h3>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Name" required>
            <UInput v-model="newClientForm.name" placeholder="Client name" />
          </UFormGroup>
          <UFormGroup label="Contact Email">
            <UInput v-model="newClientForm.contact_email" type="email" placeholder="email@example.com" />
          </UFormGroup>
          <UFormGroup label="Brand Color">
            <div class="flex items-center gap-3">
              <input type="color" v-model="newClientForm.brand_color" class="w-10 h-10 rounded cursor-pointer" />
              <UInput v-model="newClientForm.brand_color" class="flex-1" />
            </div>
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton variant="ghost" @click="showNewClientModal = false">Cancel</UButton>
            <UButton @click="createClient" :loading="isLoading" :disabled="!newClientForm.name.trim()">Create</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Edit Client Modal -->
    <UModal v-model="showEditClientModal">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">Edit Client</h3>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Name" required>
            <UInput v-model="editClientForm.name" placeholder="Client name" />
          </UFormGroup>
          <UFormGroup label="Contact Email">
            <UInput v-model="editClientForm.contact_email" type="email" placeholder="email@example.com" />
          </UFormGroup>
          <UFormGroup label="Brand Color">
            <div class="flex items-center gap-3">
              <input type="color" v-model="editClientForm.brand_color" class="w-10 h-10 rounded cursor-pointer" />
              <UInput v-model="editClientForm.brand_color" class="flex-1" />
            </div>
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton variant="ghost" @click="showEditClientModal = false">Cancel</UButton>
            <UButton @click="updateClient" :loading="isLoading" :disabled="!editClientForm.name.trim()">Save</UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Assign Accounts Modal -->
    <UModal v-model="showAssignAccountsModal">
      <UCard>
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">
            Assign Accounts to {{ selectedClient?.name }}
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
                  <span v-if="account.client_name && account.client_id !== selectedClient?.id" class="ml-2 text-amber-500">
                    ({{ account.client_name }})
                  </span>
                </p>
              </div>
            </div>
            <UButton
              v-if="account.client_id === selectedClient?.id"
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
              @click="assignAccountToClient(account.id, selectedClient?.id || null)"
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
  </div>
</template>
