<script setup lang="ts">
import type { SocialPlatform } from '~~/shared/social'

definePageMeta({
  layout: 'default',
  middleware: ['auth'],
})
useHead({ title: 'Social Diagnostics | Earnest' })

type CheckStatus = 'ok' | 'fail' | 'unconfigured'

interface EnvCheck { name: string; required: boolean; present: boolean }
interface AccountPing {
  accountId: string
  accountName: string
  accountHandle: string
  status: CheckStatus
  httpStatus?: number
  errorMessage?: string
  rawResponse?: unknown
}
interface PlatformReport {
  platform: SocialPlatform
  configured: boolean
  envChecks: EnvCheck[]
  scopesRequested: string[]
  redirectUri: string
  accountPings: AccountPing[]
}
interface DiagnosticsResponse {
  generatedAt: string
  reports: PlatformReport[]
}

const platformLabel: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  threads: 'Threads',
}

const platformBg: Record<SocialPlatform, string> = {
  instagram: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500',
  tiktok: 'bg-black',
  linkedin: 'bg-[#0A66C2]',
  facebook: 'bg-[#1877F2]',
  threads: 'bg-black',
}

const platformIcon: Record<SocialPlatform, string> = {
  instagram: 'i-lucide-instagram',
  tiktok: 'i-lucide-music',
  linkedin: 'i-lucide-linkedin',
  facebook: 'i-lucide-facebook',
  threads: 'i-lucide-at-sign',
}

const data = ref<DiagnosticsResponse | null>(null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)
const isForbidden = ref(false)

async function refresh() {
  loading.value = true
  errorMessage.value = null
  try {
    data.value = await $fetch<DiagnosticsResponse>('/api/social/diagnostics')
  } catch (err: any) {
    if (err?.statusCode === 403 || err?.response?.status === 403) {
      isForbidden.value = true
      errorMessage.value = 'Admin access required to view this page.'
    } else {
      errorMessage.value = err?.data?.message || err?.message || 'Failed to load diagnostics'
    }
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

const requiredCounts = computed(() => {
  if (!data.value) return null
  let envOk = 0, envTotal = 0, pingOk = 0, pingTotal = 0
  for (const r of data.value.reports) {
    for (const c of r.envChecks) if (c.required) {
      envTotal++; if (c.present) envOk++
    }
    for (const p of r.accountPings) {
      pingTotal++; if (p.status === 'ok') pingOk++
    }
  }
  return { envOk, envTotal, pingOk, pingTotal }
})
</script>

<template>
  <LayoutPageContainer>
    <div class="flex items-center gap-4 mb-8">
      <UButton to="/social/settings" variant="ghost" icon="i-lucide-arrow-left" size="sm" />
      <div class="flex-1">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Connection Diagnostics</h1>
        <p class="text-gray-500 dark:text-gray-400 mt-0.5">
          Developer-only health check for each social platform's OAuth configuration and connected accounts.
        </p>
      </div>
      <UButton :loading="loading" icon="i-lucide-refresh-cw" size="sm" @click="refresh">Refresh</UButton>
    </div>

    <div v-if="isForbidden" class="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/20 p-6 text-center">
      <UIcon name="i-lucide-lock" class="w-8 h-8 text-rose-500 mx-auto mb-2" />
      <h2 class="font-semibold text-gray-900 dark:text-white mb-1">Admins only</h2>
      <p class="text-sm text-gray-600 dark:text-gray-300">{{ errorMessage }}</p>
    </div>

    <div v-else-if="errorMessage && !data" class="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-6">
      <p class="text-sm text-amber-900 dark:text-amber-200">{{ errorMessage }}</p>
    </div>

    <div v-else-if="loading && !data" class="text-center py-12 text-gray-500">
      Running checks…
    </div>

    <template v-else-if="data">
      <!-- Summary -->
      <div v-if="requiredCounts" class="grid grid-cols-2 gap-4 mb-8">
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">Required env vars</p>
              <p class="text-2xl font-bold mt-1">
                <span :class="requiredCounts.envOk === requiredCounts.envTotal ? 'text-emerald-600' : 'text-amber-600'">
                  {{ requiredCounts.envOk }}
                </span>
                <span class="text-gray-400 text-base"> / {{ requiredCounts.envTotal }}</span>
              </p>
            </div>
            <UIcon
              :name="requiredCounts.envOk === requiredCounts.envTotal ? 'i-lucide-check-circle' : 'i-lucide-alert-triangle'"
              :class="requiredCounts.envOk === requiredCounts.envTotal ? 'text-emerald-500' : 'text-amber-500'"
              class="w-7 h-7"
            />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground">Account pings OK</p>
              <p class="text-2xl font-bold mt-1">
                <span :class="requiredCounts.pingOk === requiredCounts.pingTotal && requiredCounts.pingTotal > 0 ? 'text-emerald-600' : requiredCounts.pingTotal === 0 ? 'text-gray-400' : 'text-rose-600'">
                  {{ requiredCounts.pingOk }}
                </span>
                <span class="text-gray-400 text-base"> / {{ requiredCounts.pingTotal }}</span>
              </p>
            </div>
            <UIcon
              :name="requiredCounts.pingTotal === 0 ? 'i-lucide-circle-dashed' : requiredCounts.pingOk === requiredCounts.pingTotal ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
              :class="requiredCounts.pingTotal === 0 ? 'text-gray-400' : requiredCounts.pingOk === requiredCounts.pingTotal ? 'text-emerald-500' : 'text-rose-500'"
              class="w-7 h-7"
            />
          </div>
        </UCard>
      </div>

      <p class="text-xs text-muted-foreground mb-4">
        Generated {{ new Date(data.generatedAt).toLocaleString() }}.
        Diagnostic checks are server-side: env presence + a live <code>GET /me</code> ping per account using the stored token.
      </p>

      <!-- Per-platform reports -->
      <div class="space-y-4">
        <UCard v-for="report in data.reports" :key="report.platform">
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg" :class="platformBg[report.platform]">
                  <UIcon :name="platformIcon[report.platform]" class="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 class="font-semibold text-gray-900 dark:text-white">
                    {{ platformLabel[report.platform] }}
                  </h2>
                  <p class="text-xs text-muted-foreground">
                    {{ report.accountPings.length }} account{{ report.accountPings.length !== 1 ? 's' : '' }} connected
                  </p>
                </div>
              </div>
              <UBadge
                :color="report.configured ? 'emerald' : 'rose'"
                variant="subtle"
                size="sm"
              >
                {{ report.configured ? 'Configured' : 'Not configured' }}
              </UBadge>
            </div>
          </template>

          <div class="space-y-4">
            <!-- Env checks -->
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground mb-2">Environment variables</p>
              <ul class="space-y-1">
                <li v-for="env in report.envChecks" :key="env.name" class="flex items-center gap-2 text-sm">
                  <UIcon
                    :name="env.present ? 'i-lucide-check-circle-2' : (env.required ? 'i-lucide-x-circle' : 'i-lucide-circle-dashed')"
                    :class="env.present ? 'text-emerald-500' : (env.required ? 'text-rose-500' : 'text-gray-400')"
                    class="w-4 h-4 shrink-0"
                  />
                  <code class="text-[12px]">{{ env.name }}</code>
                  <span
                    class="text-[10px] uppercase tracking-wider"
                    :class="env.required ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'"
                  >{{ env.required ? 'required' : 'optional' }}</span>
                  <span class="text-[12px]" :class="env.present ? 'text-muted-foreground' : 'text-rose-600 dark:text-rose-400'">
                    {{ env.present ? 'present' : 'missing' }}
                  </span>
                </li>
              </ul>
            </div>

            <!-- Redirect URI -->
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground mb-2">Redirect URI (must match the platform's OAuth allowlist exactly)</p>
              <code class="block px-3 py-2 bg-muted/40 rounded-md text-[12px] break-all">{{ report.redirectUri }}</code>
            </div>

            <!-- Scopes requested -->
            <div>
              <p class="text-xs uppercase tracking-wider text-muted-foreground mb-2">Scopes requested at OAuth time</p>
              <div class="flex flex-wrap gap-1.5">
                <code v-for="scope in report.scopesRequested" :key="scope" class="px-2 py-0.5 bg-muted/40 rounded text-[11px]">{{ scope }}</code>
              </div>
              <p class="text-xs text-muted-foreground mt-2">
                Granted scopes are not surfaced by most platforms via /me. A successful ping below confirms at minimum that the token is valid for the basic identity scope.
              </p>
            </div>

            <!-- Account pings -->
            <div v-if="report.accountPings.length === 0" class="text-sm text-muted-foreground italic">
              No connected accounts to test.
            </div>
            <div v-else>
              <p class="text-xs uppercase tracking-wider text-muted-foreground mb-2">Account ping results</p>
              <div class="space-y-2">
                <details
                  v-for="acc in report.accountPings"
                  :key="acc.accountId"
                  class="group rounded-lg border border-border/60"
                >
                  <summary class="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer list-none select-none hover:bg-muted/30 rounded-lg">
                    <div class="flex items-center gap-3 min-w-0">
                      <UIcon
                        :name="acc.status === 'ok' ? 'i-lucide-check-circle-2' : 'i-lucide-x-circle'"
                        :class="acc.status === 'ok' ? 'text-emerald-500' : 'text-rose-500'"
                        class="w-4 h-4 shrink-0"
                      />
                      <span class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ acc.accountName }}</span>
                      <span class="text-xs text-muted-foreground truncate">@{{ acc.accountHandle }}</span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <span
                        v-if="acc.httpStatus"
                        class="text-[11px] font-medium"
                        :class="acc.status === 'ok' ? 'text-emerald-600' : 'text-rose-600'"
                      >HTTP {{ acc.httpStatus }}</span>
                      <UIcon name="i-lucide-chevron-down" class="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                    </div>
                  </summary>

                  <div class="px-3 py-3 border-t border-border/40 space-y-2 text-sm">
                    <div v-if="acc.errorMessage">
                      <p class="text-xs uppercase tracking-wider text-muted-foreground mb-1">Error</p>
                      <p class="text-rose-700 dark:text-rose-400 text-[12px]">{{ acc.errorMessage }}</p>
                    </div>
                    <div v-if="acc.rawResponse !== undefined">
                      <p class="text-xs uppercase tracking-wider text-muted-foreground mb-1">Raw response</p>
                      <pre class="text-[11px] bg-muted/40 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">{{ typeof acc.rawResponse === 'string' ? acc.rawResponse : JSON.stringify(acc.rawResponse, null, 2) }}</pre>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </LayoutPageContainer>
</template>
