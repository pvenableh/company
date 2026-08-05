<script setup lang="ts">
/**
 * Public pitch page — /p/[token]
 *
 * The Earnest "envelope" around a bespoke, self-contained client pitch. This
 * page NEVER styles the pitch itself: once unlocked it renders the stored HTML
 * byte-for-byte inside a full-bleed, sandboxed <iframe> (served by
 * /api/p/[token]/raw), so the pitch keeps its own fonts/design with zero CSS
 * collision. Earnest only owns the lock screen and the unavailable states.
 */
definePageMeta({ layout: 'blank' })

type PitchState = 'ok' | 'not_found' | 'revoked' | 'expired'
interface PitchMeta {
  state: PitchState
  title: string | null
  client_name: string | null
  requires_password: boolean
  unlocked: boolean
}

const route = useRoute()
const token = computed(() => String(route.params.token || ''))

const meta = ref<PitchMeta | null>(null)
const loading = ref(true)
const password = ref('')
const submitting = ref(false)
const passwordError = ref<string | null>(null)

const rawSrc = computed(() => `/api/p/${encodeURIComponent(token.value)}/raw`)
const showPitch = computed(() => meta.value?.state === 'ok' && meta.value.unlocked)
const showLock = computed(
  () => meta.value?.state === 'ok' && meta.value.requires_password && !meta.value.unlocked,
)

// Never let a gated pitch be indexed or previewed.
useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
  title: 'Private pitch',
})

async function loadMeta() {
  loading.value = true
  try {
    meta.value = await $fetch<PitchMeta>(`/api/p/${encodeURIComponent(token.value)}/meta`)
  } catch {
    meta.value = { state: 'not_found', title: null, client_name: null, requires_password: false, unlocked: false }
  } finally {
    loading.value = false
  }
}

async function submitPassword() {
  if (!password.value || submitting.value) return
  submitting.value = true
  passwordError.value = null
  try {
    await $fetch(`/api/p/${encodeURIComponent(token.value)}/unlock`, {
      method: 'POST',
      body: { password: password.value },
    })
    password.value = ''
    await loadMeta() // now returns unlocked: true
  } catch (err: any) {
    passwordError.value = err?.data?.message || 'Incorrect password.'
  } finally {
    submitting.value = false
  }
}

const unavailableCopy = computed(() => {
  switch (meta.value?.state) {
    case 'expired':
      return { heading: 'This link has expired', body: 'The window to view this pitch has closed. Reach out to the person who shared it for a fresh link.' }
    case 'revoked':
      return { heading: 'This link was withdrawn', body: 'This pitch is no longer available at this link. Reach out to the person who shared it.' }
    default:
      return { heading: 'Link unavailable', body: 'This pitch link is invalid or is no longer available. Reach out to the person who shared it for a fresh one.' }
  }
})

onMounted(loadMeta)
</script>

<template>
  <!-- Unlocked: hand the whole viewport to the pitch, no Earnest chrome. -->
  <iframe
    v-if="showPitch"
    :src="rawSrc"
    title="Pitch"
    class="fixed inset-0 h-full w-full border-0 bg-black"
    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
  />

  <!-- Everything else renders the Earnest envelope. Deliberately its own
       premium-dark surface (not theme tokens) so an anon visitor never gets a
       white flash before a dark pitch, and it reads on-brand regardless of
       colour-mode resolution. -->
  <div v-else class="fixed inset-0 flex items-center justify-center bg-[#0b0b0c] px-6 py-16 text-neutral-100">
    <!-- Loading -->
    <div v-if="loading" class="flex flex-col items-center gap-3 text-center">
      <Icon name="lucide:loader-2" class="h-8 w-8 animate-spin text-neutral-500" />
      <p class="text-sm text-neutral-500">Opening…</p>
    </div>

    <!-- Password lock -->
    <div v-else-if="showLock" class="w-full max-w-sm">
      <div class="flex flex-col items-center gap-2 text-center">
        <div class="mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-white/15">
          <Icon name="lucide:lock" class="h-5 w-5 text-neutral-400" />
        </div>
        <h1 class="text-lg font-medium text-neutral-50">
          {{ meta?.title || 'A private pitch' }}
        </h1>
        <p class="text-sm text-neutral-400">
          <template v-if="meta?.client_name">Prepared for {{ meta.client_name }}. </template>
          Enter the password you were given to continue.
        </p>
      </div>

      <form class="mt-6 flex flex-col gap-3" @submit.prevent="submitPassword">
        <input
          v-model="password"
          type="password"
          autocomplete="off"
          placeholder="Password"
          class="w-full rounded-full border border-white/15 bg-white/5 px-5 py-3 text-center text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-white/40"
          :disabled="submitting"
        >
        <p v-if="passwordError" class="text-center text-xs text-rose-400">{{ passwordError }}</p>
        <button
          type="submit"
          :disabled="submitting || !password"
          class="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-100 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:opacity-50"
        >
          <Icon v-if="submitting" name="lucide:loader-2" class="h-4 w-4 animate-spin" />
          {{ submitting ? 'Checking…' : 'View pitch' }}
        </button>
      </form>
    </div>

    <!-- Unavailable (not found / expired / revoked) -->
    <div v-else class="flex max-w-md flex-col items-center gap-3 text-center">
      <Icon name="lucide:link-2-off" class="h-11 w-11 text-neutral-500" />
      <h1 class="text-lg font-medium text-neutral-50">{{ unavailableCopy.heading }}</h1>
      <p class="text-sm text-neutral-400">{{ unavailableCopy.body }}</p>
    </div>
  </div>
</template>
