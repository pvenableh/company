<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Building2, Plus, Check, Settings, ArrowRight } from 'lucide-vue-next'

definePageMeta({ middleware: ['auth'] })
useHead({ title: 'Switch Organization | Earnest' })

const config = useRuntimeConfig()
const { selectedOrg, organizations, setOrganization, fetchOrganizationDetails, isLoading } = useOrganization()
const { clearClient } = useClients()

// Force a fresh fetch of organizations on page load
const refreshing = ref(true)
onMounted(async () => {
  try {
    await fetchOrganizationDetails()
  } finally {
    refreshing.value = false
  }
})

const getIconUrl = (org: any) => {
  if (!org?.icon) return undefined
  return `${config.public.directusUrl}/assets/${org.icon}?key=avatar`
}

const getInitials = (org: any) => {
  if (!org?.name) return ''
  return org.name
    .split(' ')
    .map((word: string) => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2)
}

const handleSelectOrg = (orgId: string) => {
  if (orgId !== selectedOrg.value) {
    setOrganization(orgId)
    clearClient()
  }
  // Full navigation to clear all cached state
  navigateTo('/', { external: true })
}
</script>

<template>
  <div class="flex min-h-svh items-center justify-center px-4">
    <div class="w-full max-w-lg">
      <div class="ios-card p-8">
        <!-- Header -->
        <div class="text-center mb-8">
          <div class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Building2 class="w-6 h-6 text-gray-500" />
          </div>
          <h1 class="text-xl font-semibold">Your Organizations</h1>
          <p class="text-sm text-muted-foreground mt-1">Select which organization to work in</p>
        </div>

        <!-- Loading state -->
        <div v-if="refreshing || isLoading" class="flex items-center justify-center py-12">
          <div class="flex flex-col items-center gap-3">
            <Icon name="lucide:loader-2" class="w-6 h-6 animate-spin text-muted-foreground" />
            <span class="text-sm text-muted-foreground">Loading organizations...</span>
          </div>
        </div>

        <!-- Organization list -->
        <div v-else class="space-y-3 mb-8">
          <div
            v-for="org in organizations"
            :key="org.id"
            role="button"
            tabindex="0"
            class="w-full flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer"
            :class="
              selectedOrg === org.id
                ? 'border-[var(--cyan)] bg-cyan-50/50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            "
            @click="handleSelectOrg(org.id)"
            @keydown.enter.prevent="handleSelectOrg(org.id)"
            @keydown.space.prevent="handleSelectOrg(org.id)"
          >
            <Avatar class="size-12">
              <AvatarImage v-if="getIconUrl(org)" :src="getIconUrl(org)" :alt="org.name" />
              <AvatarFallback class="text-sm font-medium">
                {{ getInitials(org) }}
              </AvatarFallback>
            </Avatar>

            <div class="flex-1 text-left min-w-0">
              <p class="text-sm font-semibold text-gray-900 truncate">{{ org.name }}</p>
              <div class="flex items-center gap-3 mt-1">
                <span v-if="org.ticketsCount > 0" class="text-xs text-gray-400">
                  {{ org.ticketsCount }} ticket{{ org.ticketsCount !== 1 ? 's' : '' }}
                </span>
                <span v-if="org.projectsCount > 0" class="text-xs text-gray-400">
                  {{ org.projectsCount }} project{{ org.projectsCount !== 1 ? 's' : '' }}
                </span>
                <span v-if="org.plan" class="text-[10px] text-[var(--cyan)] uppercase font-medium">
                  {{ org.plan }}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <Check
                v-if="selectedOrg === org.id"
                class="size-5 text-[var(--cyan)]"
              />
              <ArrowRight v-else class="size-4 text-gray-300" />
            </div>
          </div>

          <!-- Empty state -->
          <div v-if="!organizations.length" class="text-center py-8">
            <p class="text-sm text-muted-foreground">No organizations found.</p>
            <p class="text-xs text-muted-foreground mt-1">Create one to get started.</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="border-t border-gray-200 pt-6 space-y-3">
          <NuxtLink
            to="/organization/new"
            class="w-full flex items-center gap-3 p-4 rounded-xl border border-dashed border-gray-300 hover:border-[var(--cyan)] hover:bg-cyan-50/30 transition-all group"
          >
            <div class="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-cyan-100 flex items-center justify-center transition-colors">
              <Plus class="size-5 text-gray-400 group-hover:text-[var(--cyan)] transition-colors" />
            </div>
            <div class="text-left">
              <p class="text-sm font-medium text-gray-700 group-hover:text-gray-900">Register New Organization</p>
              <p class="text-xs text-gray-400">Requires a new subscription</p>
            </div>
          </NuxtLink>

          <NuxtLink
            v-if="selectedOrg"
            to="/organization"
            class="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all group"
          >
            <div class="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <Settings class="size-4 text-gray-400" />
            </div>
            <div class="text-left">
              <p class="text-sm font-medium text-gray-600 group-hover:text-gray-900">Organization Settings</p>
              <p class="text-xs text-gray-400">Manage your current organization</p>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
