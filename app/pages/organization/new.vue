<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Building2, ChevronLeft, ChevronRight, Plus, X, Check, Sparkles, CreditCard, PackagePlus } from 'lucide-vue-next'

definePageMeta({ middleware: ['auth'] })
useHead({ title: 'New Organization | Earnest' })

const { setOrganization, organizations, isInitialized, initializeOrganizations } = useOrganization()
const router = useRouter()
const route = useRoute()

// ── Step state ──
// Internal step indices (1..6):
//   1=name, 2=plan, 3=details, 4=payment, 5=addons, 6=invite
// The Add-ons step is only shown on the paid path. Free-tier users go from
// step 4 directly to step 6 (invite). The progress bar collapses to 5 dots
// when paidCheckoutCompleted is false.
const currentStep = ref(1)
const creating = ref(false)
const checkingOut = ref(false)
const subscribingAddons = ref(false)
const paidCheckoutCompleted = ref(false)
const stripeSessionId = ref<string | null>(null)

// The Stripe subscription id returned when the no-card trial is started.
const subscriptionId = ref<string | null>(null)
const termsReaffirmed = ref(false)

const totalSteps = computed(() => paidCheckoutCompleted.value ? 7 : 6)
const displayedStep = computed(() => {
  // On the free path, step 6 (invite) is shown as "step 5 of 5".
  if (!paidCheckoutCompleted.value && currentStep.value === 7) return 6
  return currentStep.value
})

// ── Form data ──
const orgName = ref('')
const selectedIndustry = ref<string | null>(null)
const selectedPlan = ref('solo')
const selectedInterval = ref<'monthly' | 'annual'>('monthly')
const orgLocation = ref('')
const orgWebsite = ref('')
const orgBrandColor = ref('')
// Brand voice (step 4) — feeds getBrandContext() into every future AI action.
const brandDirection = ref('')
const targetAudience = ref('')
const brandIdealClient = ref('')
const brandDifferentiator = ref('')
const brandDrafting = ref(false)
const brandDrafted = ref(false)
const brandDraftNote = ref('')
const invites = ref<{ email: string; role: string }[]>([])
const newInviteEmail = ref('')
const newInviteRole = ref('member')

// Add-on selection (paid path only). Map of addonId -> selected.
const selectedAddons = ref<Record<string, boolean>>({})

// Created-org tracker — persisted across the Stripe round-trip so step 5
// invite-sending targets the existing org instead of creating a duplicate.
const createdOrgId = ref<string | null>(null)

// ── Persistence ──
// sessionStorage survives the Stripe checkout redirect (same-origin return).
const STATE_KEY = 'organization-new-wizard-state'

function loadState() {
  if (!import.meta.client) return
  try {
    const saved = sessionStorage.getItem(STATE_KEY)
    if (!saved) return
    const data = JSON.parse(saved)
    orgName.value = data.orgName || ''
    selectedIndustry.value = data.selectedIndustry || null
    selectedPlan.value = data.selectedPlan || 'solo'
    selectedInterval.value = data.selectedInterval || 'monthly'
    orgLocation.value = data.orgLocation || ''
    orgWebsite.value = data.orgWebsite || ''
    orgBrandColor.value = data.orgBrandColor || ''
    brandDirection.value = data.brandDirection || ''
    targetAudience.value = data.targetAudience || ''
    brandIdealClient.value = data.brandIdealClient || ''
    brandDifferentiator.value = data.brandDifferentiator || ''
    brandDrafted.value = !!(data.brandDirection || data.targetAudience)
    invites.value = Array.isArray(data.invites) ? data.invites : []
    createdOrgId.value = data.createdOrgId || null
    paidCheckoutCompleted.value = !!data.paidCheckoutCompleted
    stripeSessionId.value = data.stripeSessionId || null
    subscriptionId.value = data.subscriptionId || null
    selectedAddons.value = (data.selectedAddons && typeof data.selectedAddons === 'object') ? data.selectedAddons : {}
  } catch {}
}

function saveState() {
  if (!import.meta.client) return
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({
      orgName: orgName.value,
      selectedIndustry: selectedIndustry.value,
      selectedPlan: selectedPlan.value,
      selectedInterval: selectedInterval.value,
      orgLocation: orgLocation.value,
      orgWebsite: orgWebsite.value,
      orgBrandColor: orgBrandColor.value,
      brandDirection: brandDirection.value,
      targetAudience: targetAudience.value,
      brandIdealClient: brandIdealClient.value,
      brandDifferentiator: brandDifferentiator.value,
      invites: invites.value,
      createdOrgId: createdOrgId.value,
      paidCheckoutCompleted: paidCheckoutCompleted.value,
      stripeSessionId: stripeSessionId.value,
      subscriptionId: subscriptionId.value,
      selectedAddons: selectedAddons.value,
    }))
  } catch {}
}

function clearState() {
  if (!import.meta.client) return
  try { sessionStorage.removeItem(STATE_KEY) } catch {}
}

// ── Industries (fetched from Directus) ──
const { list } = useDirectusItems('industries')
const industries = ref<{ id: string; name: string }[]>([])

onMounted(async () => {
  // 1. Restore state if present (Stripe round-trip support)
  loadState()

  // 2. Handle return URL params from Stripe checkout
  const stepParam = route.query.step as string | undefined
  const checkoutFlag = route.query.checkout as string | undefined
  const orgIdParam = route.query.org_id as string | undefined
  const sessionIdParam = route.query.session_id as string | undefined

  if (stepParam === 'invite' && checkoutFlag === 'ok') {
    // Successful Stripe round-trip — flip into the paid path so the wizard
    // surfaces the Add-ons step (5) before Invite (6).
    if (orgIdParam && !createdOrgId.value) createdOrgId.value = orgIdParam
    if (createdOrgId.value) setOrganization(createdOrgId.value)
    if (sessionIdParam) stripeSessionId.value = sessionIdParam
    paidCheckoutCompleted.value = true
    toast.success('Payment received — pick any add-ons to round it out')
    currentStep.value = 6  // Add-ons step (paid path)
    saveState()
    router.replace({ path: '/organization/new' })
  } else if (stepParam === 'plan' && checkoutFlag === 'cancel') {
    currentStep.value = 2
    toast.info('No problem — pick a plan when you’re ready to start your free trial.')
    router.replace({ path: '/organization/new' })
  }

  // 3. Fetch industries
  try {
    const data = await list({ fields: ['id', 'name'], sort: ['name'] })
    industries.value = data as any[]
  } catch {}
})

// Persist on every relevant change. Cheap and lossless across reloads.
watch(
  [orgName, selectedIndustry, selectedPlan, selectedInterval, orgLocation, orgWebsite, orgBrandColor, brandDirection, targetAudience, brandIdealClient, brandDifferentiator, invites, createdOrgId, paidCheckoutCompleted, stripeSessionId, subscriptionId, selectedAddons],
  () => saveState(),
  { deep: true },
)

// ── Plans + pricing ──
const plans = [
  {
    key: 'solo',
    name: 'Solo',
    monthly: 49,
    annual: 408,
    desc: 'For the one-person shop doing serious work.',
    features: ['1 team seat', 'Every feature included', '100K Earnest tokens/month', '5 client portal seats'],
  },
  {
    key: 'studio',
    name: 'Studio',
    monthly: 149,
    annual: 1241,
    desc: 'For the team that means business.',
    popular: true,
    features: ['8 team seats', 'Team channels & video', '400K Earnest tokens/month', '15 client portal seats'],
  },
  {
    key: 'agency',
    name: 'Agency',
    monthly: 299,
    annual: 2988,
    desc: 'For the business that has grown into something real.',
    features: ['15 team seats', 'Priority support', '1M Earnest tokens/month', 'Unlimited client portals'],
  },
]

// ── Add-ons (mirrors EARNEST_ADDONS price/feature surface) ──
// Source of truth for Stripe price IDs lives server-side; the wizard only
// references add-on ids and human-facing copy.
const addons = [
  { id: 'extra_seats_5', name: 'Extra Seats', price: 15, blurb: '+5 team seats' },
  { id: 'communications', name: 'Communications', price: 49, blurb: 'Phone, SMS, video & live chat' },
  { id: 'client_pack_starter', name: 'Client Pack Starter', price: 29, blurb: '+5 client portal seats · 50K tokens' },
  { id: 'client_pack_pro', name: 'Client Pack Pro', price: 59, blurb: '+10 client portal seats · 150K tokens' },
  { id: 'client_pack_unlimited', name: 'Client Pack Unlimited', price: 129, blurb: 'Unlimited client portals · 500K tokens' },
  { id: 'white_label', name: 'Companion White-Label', price: 19, blurb: 'Remove Earnest branding', agencyOnly: true },
]

const visibleAddons = computed(() => {
  return addons.filter(a => !a.agencyOnly || selectedPlan.value === 'agency')
})

const selectedAddonCount = computed(() => Object.values(selectedAddons.value).filter(Boolean).length)
const selectedAddonsTotal = computed(() => {
  return addons.reduce((sum, a) => sum + (selectedAddons.value[a.id] ? a.price : 0), 0)
})

const currentPlan = computed(() => plans.find(p => p.key === selectedPlan.value) || plans[0])
const currentPrice = computed(() => {
  const p = currentPlan.value
  return selectedInterval.value === 'annual' ? p.annual : p.monthly
})
const intervalLabel = computed(() => selectedInterval.value === 'annual' ? '/yr' : '/mo')

// ── Roles for invites ──
const roles = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Member' },
]

// ── Validation ──
const canProceed = computed(() => {
  if (currentStep.value === 1) return orgName.value.trim().length > 0
  return true
})

// ── Navigation ──
function nextStep() {
  // Steps 1-3 advance normally. Step 4 is handled by Skip-Free /
  // Continue-to-Payment buttons. Steps 5-6 use their own handlers.
  if (currentStep.value < 5 && canProceed.value) {
    currentStep.value++
  }
}

function prevStep() {
  // Once the org is committed (step 5+), there is no rewind. Free path users
  // never visit step 5.
  if (currentStep.value > 1 && currentStep.value <= 5) {
    currentStep.value--
  }
}

// ── Brand voice (step 4) ──
const industryName = computed(() =>
  industries.value.find(i => i.id === selectedIndustry.value)?.name || '',
)

async function draftBrandVoice() {
  if (brandDrafting.value) return
  brandDrafting.value = true
  brandDraftNote.value = ''
  try {
    const res = await $fetch('/api/ai/onboarding-brand', {
      method: 'POST',
      body: {
        name: orgName.value.trim(),
        industry: industryName.value,
        website: orgWebsite.value.trim() || undefined,
        answers: {
          idealClient: brandIdealClient.value.trim() || undefined,
          differentiator: brandDifferentiator.value.trim() || undefined,
        },
      },
    }) as { brand_direction: string; target_audience: string; readWebsite: boolean }
    if (res.brand_direction) brandDirection.value = res.brand_direction
    if (res.target_audience) targetAudience.value = res.target_audience
    brandDrafted.value = true
    brandDraftNote.value = res.readWebsite
      ? 'Drafted from your website — edit anything that feels off.'
      : 'Drafted from your industry — add your website above for a sharper read.'
  } catch (err: any) {
    toast.error(err?.data?.message || 'Could not draft your brand voice. You can write it yourself.')
  } finally {
    brandDrafting.value = false
  }
}

// ── Invite management ──
function addInvite() {
  const email = newInviteEmail.value.trim()
  if (!email || !email.includes('@')) return
  if (invites.value.some(i => i.email === email)) return
  invites.value.push({ email, role: newInviteRole.value })
  newInviteEmail.value = ''
  newInviteRole.value = 'member'
}

function removeInvite(index: number) {
  invites.value.splice(index, 1)
}

// ── Org creation (idempotent) ──
async function ensureOrgCreated(plan: string): Promise<string> {
  if (createdOrgId.value) return createdOrgId.value

  // A public signup that registered WITH an org name already has a capped,
  // pre-plan org (subscription_status:'incomplete') and was routed here by the
  // trial-expiry gate. Reuse it instead of creating a duplicate — the trial
  // subscription then activates THIS org. (Orgless signups have no such row and
  // fall through to creation below.)
  if (!isInitialized.value) await initializeOrganizations().catch(() => {})
  const existing = (organizations.value || []).find(
    (o: any) => o?.subscription_status === 'incomplete' && o?.plan !== 'enterprise',
  ) as any
  if (existing?.id) {
    createdOrgId.value = existing.id
    setOrganization(existing.id)
    return existing.id
  }

  const result = await $fetch('/api/org/create', {
    method: 'POST',
    body: {
      name: orgName.value.trim(),
      plan,
      industry: selectedIndustry.value,
      location: orgLocation.value.trim() || undefined,
      website: orgWebsite.value.trim() || undefined,
      brand_color: orgBrandColor.value.trim() || undefined,
      brand_direction: brandDirection.value.trim() || undefined,
      target_audience: targetAudience.value.trim() || undefined,
    },
  }) as any

  const id = result?.organization?.id
  if (!id) throw new Error('Organization creation returned no id')

  createdOrgId.value = id
  setOrganization(id)
  return id
}

// ── Trial start (step 5) ──
// (The public "Start Free" path is retired — `free` is internal-only now.)

// ── Add-ons step actions ──
async function handleSubscribeAddons() {
  if (subscribingAddons.value) return
  const picks = addons.filter(a => selectedAddons.value[a.id])

  // Nothing selected: just advance.
  if (picks.length === 0) {
    currentStep.value = 7
    return
  }

  if (!createdOrgId.value) {
    toast.error('Organization not created — please refresh')
    return
  }

  subscribingAddons.value = true
  let failures = 0

  for (const addon of picks) {
    try {
      await $fetch('/api/stripe/addons/subscribe', {
        method: 'POST',
        body: {
          orgId: createdOrgId.value,
          addonId: addon.id,
          // Pass the subscription id directly when we created it via Elements
          // (no webhook race); fall back to the Checkout sessionId for the
          // legacy redirect flow.
          subscriptionId: subscriptionId.value || undefined,
          sessionId: stripeSessionId.value || undefined,
        },
      })
    } catch (err: any) {
      console.warn('[wizard] add-on subscribe failed:', addon.id, err?.data?.message || err?.message)
      failures++
    }
  }

  subscribingAddons.value = false

  if (failures === picks.length) {
    toast.error('Couldn\'t add the selected add-ons. You can add them later from billing.')
  } else if (failures > 0) {
    toast.warning(`Added ${picks.length - failures} of ${picks.length} add-ons. The rest can be added from billing.`)
  } else {
    toast.success(`Added ${picks.length} add-on${picks.length > 1 ? 's' : ''}`)
  }

  currentStep.value = 7
}

function handleSkipAddons() {
  currentStep.value = 7
}

async function handleStartTrial() {
  if (creating.value || checkingOut.value) return
  if (!termsReaffirmed.value) {
    toast.error('Please agree to the Terms of Service and Privacy Policy')
    return
  }
  checkingOut.value = true
  try {
    await ensureOrgCreated(selectedPlan.value)

    // Start a 14-day NO-CARD trial. The server creates a `trialing` Stripe
    // subscription with no payment method — there's no clientSecret to confirm,
    // so we skip Stripe Elements entirely. The webhook raises the org's plan +
    // token limits and mirrors subscription_status:'trialing' onto the org.
    const data = await $fetch<{ subscriptionId: string; status: string; trialEnd: string | null }>(
      '/api/stripe/subscription/create',
      {
        method: 'POST',
        body: {
          organizationId: createdOrgId.value,
          plan: selectedPlan.value,
          interval: selectedInterval.value,
          termsAcceptedAt: new Date().toISOString(),
        },
      },
    )

    subscriptionId.value = data.subscriptionId
    toast.success('Your 14-day free trial has started — no card needed. We’ll ask for one at day 14.')
    // Add-ons require a card, so the trial signup skips straight to inviting the
    // team. The owner can add add-ons from Billing after adding a card.
    currentStep.value = 7
  } catch (err: any) {
    toast.error(err?.data?.message || err?.message || 'Failed to start your free trial')
  } finally {
    checkingOut.value = false
  }
}

// ── Final step: send invites & finish ──
async function handleFinish() {
  if (creating.value) return
  if (!createdOrgId.value) {
    toast.error('Organization not created — please refresh and try again')
    return
  }
  creating.value = true

  try {
    if (invites.value.length > 0) {
      for (const invite of invites.value) {
        try {
          await $fetch('/api/org/invite-member', {
            method: 'POST',
            body: {
              email: invite.email,
              roleSlug: invite.role,
              organizationId: createdOrgId.value,
            },
          })
        } catch {
          // Continue even if a single invite fails
        }
      }
    }

    toast.success('You\'re all set!')

    clearState()
    if (import.meta.client) {
      // Brief delay so the success toast registers before reload.
      setTimeout(() => { window.location.href = '/' }, 400)
    }
  } catch (err: any) {
    toast.error(err?.data?.message || 'Something went wrong')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="flex min-h-svh items-center justify-center px-4 py-12">
    <div class="w-full max-w-xl">
      <div class="ios-card p-8">
        <!-- Step indicator (collapses to 5 dots for free path, 6 for paid) -->
        <div class="flex items-center gap-1.5 mb-8">
          <div
            v-for="s in totalSteps"
            :key="s"
            class="flex-1 h-1 rounded-full transition-all duration-500"
            :class="s <= displayedStep ? 'bg-[var(--cyan)]' : 'bg-muted/50'"
          />
        </div>

        <!-- ═══ STEP 1: Name + Industry ═══ -->
        <div v-if="currentStep === 1">
          <div class="text-center mb-8">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Building2 class="w-6 h-6 text-gray-500" />
            </div>
            <h1 class="text-xl font-semibold">Create Your Organization</h1>
            <p class="text-sm text-muted-foreground mt-1">What's the name of your company or team?</p>
          </div>

          <div class="space-y-6">
            <div>
              <label class="text-sm font-medium mb-1.5 block">Organization Name</label>
              <input
                v-model="orgName"
                type="text"
                placeholder="e.g. Acme Creative Agency"
                class="w-full rounded-full glass-field px-3 py-2.5 text-sm focus:outline-none"
                autofocus
                @keydown.enter="canProceed && nextStep()"
              />
            </div>

            <div>
              <label class="text-sm font-medium mb-2 block">Industry</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="ind in industries"
                  :key="ind.id"
                  class="px-4 py-2.5 rounded-full text-[11px] font-medium text-left transition-all border"
                  :class="selectedIndustry === ind.id
                    ? 'border-[var(--cyan)] bg-info/10 text-foreground'
                    : 'border-border bg-card hover:border-foreground/30 text-muted-foreground hover:text-foreground'"
                  @click="selectedIndustry = ind.id"
                >
                  {{ ind.name }}
                </button>
              </div>
              <p class="mt-2 text-[11px] text-muted-foreground">Optional — you can skip this or change it later.</p>
            </div>
          </div>
        </div>

        <!-- ═══ STEP 2: Plan Selection ═══ -->
        <div v-if="currentStep === 2">
          <div class="text-center mb-8">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Sparkles class="w-6 h-6 text-gray-500" />
            </div>
            <h1 class="text-xl font-semibold">Choose Your Plan</h1>
            <p class="text-sm text-muted-foreground mt-1">You can change this anytime. All plans include every feature.</p>
          </div>

          <!-- Billing interval toggle -->
          <div class="flex justify-center mb-5">
            <div class="inline-flex p-1 bg-muted/50 rounded-full">
              <button
                class="px-4 py-1.5 rounded-full text-xs font-medium transition-all"
                :class="selectedInterval === 'monthly'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'"
                @click="selectedInterval = 'monthly'"
              >
                Monthly
              </button>
              <button
                class="px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5"
                :class="selectedInterval === 'annual'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'"
                @click="selectedInterval = 'annual'"
              >
                Annual
                <span class="text-[9px] uppercase tracking-wider text-[var(--cyan)] font-bold">2 mo free</span>
              </button>
            </div>
          </div>

          <div class="space-y-3">
            <button
              v-for="plan in plans"
              :key="plan.key"
              class="w-full text-left p-4 rounded-xl border-2 transition-all relative"
              :class="selectedPlan === plan.key
                ? 'border-[var(--cyan)] bg-info/10'
                : 'border-gray-200 hover:border-gray-300 bg-white'"
              @click="selectedPlan = plan.key"
            >
              <span
                v-if="plan.popular"
                class="absolute -top-2.5 right-4 text-[9px] font-bold uppercase tracking-wider bg-[var(--cyan)] text-white px-2.5 py-0.5 rounded-full"
              >Popular</span>

              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-baseline gap-2">
                    <span class="text-base font-bold">{{ plan.name }}</span>
                    <span class="text-lg font-bold">${{ selectedInterval === 'annual' ? plan.annual : plan.monthly }}</span>
                    <span class="text-xs text-muted-foreground">{{ selectedInterval === 'annual' ? '/yr' : '/mo' }}</span>
                  </div>
                  <p class="text-xs text-muted-foreground mt-0.5">{{ plan.desc }}</p>
                  <div class="flex flex-wrap gap-x-4 gap-y-0.5 mt-2">
                    <span v-for="f in plan.features" :key="f" class="text-[10px] text-gray-500 flex items-center gap-1">
                      <Check class="w-3 h-3 text-[var(--cyan)]" />
                      {{ f }}
                    </span>
                  </div>
                </div>
                <div
                  class="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                  :class="selectedPlan === plan.key ? 'border-[var(--cyan)] bg-[var(--cyan)]' : 'border-gray-300'"
                >
                  <Check v-if="selectedPlan === plan.key" class="w-3 h-3 text-white" />
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- ═══ STEP 3: Details (Optional) ═══ -->
        <div v-if="currentStep === 3">
          <div class="text-center mb-8">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="lucide:palette" class="w-6 h-6 text-gray-500" />
            </div>
            <h1 class="text-xl font-semibold">Organization Details</h1>
            <p class="text-sm text-muted-foreground mt-1">Optional — you can always set these up later.</p>
          </div>

          <div class="space-y-4">
            <div>
              <label class="text-sm font-medium mb-1.5 block">Location</label>
              <input
                v-model="orgLocation"
                type="text"
                placeholder="e.g. Miami, FL"
                class="w-full rounded-full glass-field px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>

            <div>
              <label class="text-sm font-medium mb-1.5 block">Website</label>
              <input
                v-model="orgWebsite"
                type="text"
                placeholder="e.g. https://yourcompany.com"
                class="w-full rounded-full glass-field px-3 py-2.5 text-sm focus:outline-none"
              />
            </div>

            <div>
              <label class="text-sm font-medium mb-1.5 block">Brand Color</label>
              <div class="flex items-center gap-3">
                <div
                  class="w-10 h-10 rounded-lg border border-gray-200 shrink-0"
                  :style="{ backgroundColor: orgBrandColor || '#e5e7eb' }"
                />
                <input
                  v-model="orgBrandColor"
                  type="text"
                  placeholder="#000000"
                  maxlength="7"
                  class="w-full rounded-full glass-field px-3 py-2.5 text-sm font-mono focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ STEP 4: Brand voice ═══ -->
        <div v-if="currentStep === 4">
          <div class="text-center mb-8">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="lucide:sparkles" class="w-6 h-6 text-gray-500" />
            </div>
            <h1 class="text-xl font-semibold">Your brand voice</h1>
            <p class="text-sm text-muted-foreground mt-1">Earnest writes in your voice everywhere — proposals, emails, marketing. Let it draft a starting point from what you've told us, then make it yours.</p>
          </div>

          <div class="space-y-4">
            <button
              type="button"
              class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium bg-[var(--cyan)]/10 text-[var(--cyan)] hover:bg-[var(--cyan)]/15 transition-colors disabled:opacity-50"
              :disabled="brandDrafting"
              @click="draftBrandVoice"
            >
              <Icon :name="brandDrafting ? 'lucide:loader-2' : 'lucide:sparkles'" class="w-4 h-4" :class="brandDrafting && 'animate-spin'" />
              {{ brandDrafting ? 'Reading your business…' : (brandDrafted ? 'Regenerate with Earnest' : 'Draft with Earnest') }}
            </button>
            <p v-if="brandDraftNote" class="text-[11px] text-center text-muted-foreground -mt-2">{{ brandDraftNote }}</p>

            <div>
              <label class="text-sm font-medium mb-1.5 block">Brand direction</label>
              <textarea
                v-model="brandDirection"
                rows="4"
                placeholder="Your positioning, voice, and tone — how your brand should come across."
                class="w-full rounded-2xl glass-field px-3 py-2.5 text-sm focus:outline-none resize-none"
              />
            </div>

            <div>
              <label class="text-sm font-medium mb-1.5 block">Target audience</label>
              <textarea
                v-model="targetAudience"
                rows="4"
                placeholder="Who you serve, what they care about, and the problems you solve for them."
                class="w-full rounded-2xl glass-field px-3 py-2.5 text-sm focus:outline-none resize-none"
              />
            </div>

            <details class="rounded-2xl bg-muted/30 px-4 py-3">
              <summary class="text-xs font-medium text-muted-foreground cursor-pointer select-none">Sharpen the draft (optional)</summary>
              <div class="space-y-3 mt-3">
                <div>
                  <label class="text-xs font-medium mb-1 block">Who's your ideal client?</label>
                  <input v-model="brandIdealClient" type="text" placeholder="e.g. boutique hotels in the Southeast" class="w-full rounded-full glass-field px-3 py-2 text-sm focus:outline-none" />
                </div>
                <div>
                  <label class="text-xs font-medium mb-1 block">What makes you different?</label>
                  <input v-model="brandDifferentiator" type="text" placeholder="e.g. a senior team, not a content factory" class="w-full rounded-full glass-field px-3 py-2 text-sm focus:outline-none" />
                </div>
                <p class="text-[11px] text-muted-foreground">Answer these, then hit "Regenerate with Earnest" for a sharper draft.</p>
              </div>
            </details>
          </div>
        </div>

        <!-- ═══ STEP 5: Payment ═══ -->
        <div v-if="currentStep === 5">
          <div class="text-center mb-8">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <CreditCard class="w-6 h-6 text-gray-500" />
            </div>
            <h1 class="text-xl font-semibold">Set Up Payment</h1>
            <p class="text-sm text-muted-foreground mt-1">Cancel anytime from your account.</p>
          </div>

          <!-- Order summary -->
          <div class="rounded-xl border-2 border-[var(--cyan)] bg-info/10 p-4 mb-5">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Selected plan</p>
                <p class="text-base font-bold">{{ currentPlan.name }} · {{ selectedInterval === 'annual' ? 'Annual' : 'Monthly' }}</p>
                <p class="text-xs text-muted-foreground mt-1">{{ currentPlan.desc }}</p>
              </div>
              <div class="text-right shrink-0 ml-3">
                <p class="text-2xl font-bold leading-none">${{ currentPrice }}</p>
                <p class="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{{ intervalLabel }}</p>
              </div>
            </div>
            <div class="flex flex-wrap gap-x-4 gap-y-0.5 mt-3 pt-3 border-t border-info/40">
              <span v-for="f in currentPlan.features" :key="f" class="text-[10px] text-gray-600 flex items-center gap-1">
                <Check class="w-3 h-3 text-[var(--cyan)]" />
                {{ f }}
              </span>
            </div>
          </div>

          <!-- 14-day no-card trial notice -->
          <div class="rounded-lg border border-[var(--cyan)]/40 bg-info/10 p-3 mb-4 text-center">
            <p class="text-xs font-medium text-foreground">14-day free trial — no credit card required</p>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              You won’t be charged today. We’ll ask for a card at day 14 to keep your plan.
            </p>
          </div>

          <!-- Terms re-affirmation -->
          <label class="flex items-start gap-2 cursor-pointer select-none mb-4 p-3 rounded-lg border border-gray-200 bg-muted/10 hover:bg-muted/20 transition-colors">
            <input
              v-model="termsReaffirmed"
              type="checkbox"
              class="mt-0.5 h-4 w-4 rounded border-gray-300 text-[var(--cyan)] focus:ring-2 focus:ring-[var(--cyan)] focus:ring-offset-0 cursor-pointer shrink-0"
            />
            <span class="text-[12px] text-muted-foreground leading-relaxed">
              I agree to the
              <NuxtLink to="/terms-of-service" target="_blank" class="text-foreground font-medium hover:underline underline-offset-4">Terms of Service</NuxtLink>
              and
              <NuxtLink to="/privacy-policy" target="_blank" class="text-foreground font-medium hover:underline underline-offset-4">Privacy Policy</NuxtLink>.
              My {{ currentPlan.name }} plan starts a 14-day free trial, then bills ${{ currentPrice }}{{ intervalLabel }} unless I cancel.
            </span>
          </label>
        </div>

        <!-- ═══ STEP 5: Add-ons (paid path only) ═══ -->
        <div v-if="currentStep === 6">
          <div class="text-center mb-8">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <PackagePlus class="w-6 h-6 text-gray-500" />
            </div>
            <h1 class="text-xl font-semibold">Round it out with add-ons</h1>
            <p class="text-sm text-muted-foreground mt-1">Optional — billed monthly alongside your plan. You can change these anytime.</p>
          </div>

          <div class="space-y-2">
            <button
              v-for="addon in visibleAddons"
              :key="addon.id"
              class="w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-center gap-3"
              :class="selectedAddons[addon.id]
                ? 'border-[var(--cyan)] bg-info/10'
                : 'border-gray-200 hover:border-gray-300 bg-white'"
              @click="selectedAddons[addon.id] = !selectedAddons[addon.id]"
            >
              <div
                class="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors"
                :class="selectedAddons[addon.id] ? 'border-[var(--cyan)] bg-[var(--cyan)]' : 'border-gray-300'"
              >
                <Check v-if="selectedAddons[addon.id]" class="w-3 h-3 text-white" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2">
                  <span class="text-sm font-semibold">{{ addon.name }}</span>
                  <span class="text-[10px] text-muted-foreground">{{ addon.blurb }}</span>
                </div>
              </div>
              <div class="text-right shrink-0">
                <span class="text-sm font-bold">${{ addon.price }}</span>
                <span class="text-[10px] text-muted-foreground ml-0.5">/mo</span>
              </div>
            </button>
          </div>

          <!-- Running total -->
          <div
            v-if="selectedAddonCount > 0"
            class="mt-4 p-3 rounded-lg bg-info/10 border border-info/60 flex items-center justify-between"
          >
            <span class="text-xs text-muted-foreground">{{ selectedAddonCount }} add-on{{ selectedAddonCount > 1 ? 's' : '' }} selected</span>
            <span class="text-sm font-bold">+${{ selectedAddonsTotal }}/mo</span>
          </div>
        </div>

        <!-- ═══ STEP 6: Invite Team (Optional) ═══ -->
        <div v-if="currentStep === 7">
          <div class="text-center mb-8">
            <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="lucide:users" class="w-6 h-6 text-gray-500" />
            </div>
            <h1 class="text-xl font-semibold">Invite Your Team</h1>
            <p class="text-sm text-muted-foreground mt-1">Optional — add team members now or invite them later.</p>
          </div>

          <div class="space-y-4">
            <!-- Add invite form -->
            <div class="flex items-center gap-2">
              <input
                v-model="newInviteEmail"
                type="email"
                placeholder="team@example.com"
                class="flex-1 rounded-full glass-field px-3 py-2.5 text-sm focus:outline-none"
                @keydown.enter.prevent="addInvite"
              />
              <select
                v-model="newInviteRole"
                class="rounded-lg glass-field px-2 py-2.5 text-sm focus:outline-none"
              >
                <option v-for="r in roles" :key="r.value" :value="r.value">{{ r.label }}</option>
              </select>
              <button
                class="w-10 h-10 rounded-full bg-[var(--cyan)] text-white flex items-center justify-center shrink-0 hover:opacity-90 transition-opacity disabled:opacity-40"
                :disabled="!newInviteEmail.includes('@')"
                @click="addInvite"
              >
                <Plus class="w-4 h-4" />
              </button>
            </div>

            <!-- Invite list -->
            <div v-if="invites.length > 0" class="space-y-2">
              <div
                v-for="(invite, i) in invites"
                :key="invite.email"
                class="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-8 h-8 rounded-full bg-[var(--cyan)]/10 flex items-center justify-center shrink-0">
                    <Icon name="lucide:mail" class="w-4 h-4 text-[var(--cyan)]" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm truncate">{{ invite.email }}</p>
                    <p class="text-[10px] text-muted-foreground uppercase tracking-wider">{{ invite.role }}</p>
                  </div>
                </div>
                <button
                  class="w-7 h-7 rounded-full hover:bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  @click="removeInvite(i)"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- Empty state -->
            <div v-else class="text-center py-6 text-muted-foreground">
              <Icon name="lucide:user-plus" class="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p class="text-xs">No invites added yet. You can always invite people later.</p>
            </div>
          </div>
        </div>

        <!-- ═══ Navigation buttons ═══ -->
        <div class="flex items-center gap-3 mt-8 pt-6 border-t border-border/30">
          <!-- Back / Cancel (only for steps 2-4 pre-payment; step 5+ is post-commit) -->
          <button
            v-if="currentStep > 1 && currentStep <= 5"
            class="flex items-center gap-1 px-4 py-2.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            @click="prevStep"
          >
            <ChevronLeft class="w-4 h-4" />
            Back
          </button>
          <button
            v-else-if="currentStep === 1"
            class="flex items-center gap-1 px-4 py-2.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            @click="router.back()"
          >
            Cancel
          </button>

          <div class="flex-1" />

          <!-- Skip (steps 3 & 4 — details and brand voice are optional) -->
          <button
            v-if="currentStep === 3 || currentStep === 4"
            class="px-4 py-2.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            @click="nextStep"
          >
            Skip
          </button>

          <!-- Steps 1-3: Continue -->
          <button
            v-if="currentStep < 5"
            class="flex items-center gap-1 px-6 py-2.5 rounded-full text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40"
            :disabled="!canProceed"
            @click="nextStep"
          >
            Continue
            <ChevronRight class="w-4 h-4" />
          </button>

          <!-- Step 5: start the 14-day free trial (no card) -->
          <template v-else-if="currentStep === 5">
            <button
              class="flex items-center gap-1 px-6 py-2.5 rounded-full text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40"
              :disabled="creating || checkingOut || !termsReaffirmed"
              @click="handleStartTrial"
            >
              <Icon v-if="checkingOut" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
              {{ checkingOut ? 'Starting trial…' : 'Start free trial' }}
              <ChevronRight v-if="!checkingOut" class="w-4 h-4" />
            </button>
          </template>

          <!-- Step 5: Add-ons (skip / subscribe) -->
          <template v-else-if="currentStep === 6">
            <button
              class="px-4 py-2.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              :disabled="subscribingAddons"
              @click="handleSkipAddons"
            >
              Skip add-ons
            </button>
            <button
              class="flex items-center gap-1 px-6 py-2.5 rounded-full text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40"
              :disabled="subscribingAddons"
              @click="handleSubscribeAddons"
            >
              <Icon v-if="subscribingAddons" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
              {{ subscribingAddons ? 'Adding...' : (selectedAddonCount > 0 ? `Add ${selectedAddonCount} & Continue` : 'Continue') }}
              <ChevronRight v-if="!subscribingAddons" class="w-4 h-4" />
            </button>
          </template>

          <!-- Step 6: Finish -->
          <button
            v-else-if="currentStep === 7"
            class="flex items-center gap-1 px-6 py-2.5 rounded-full text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40"
            :disabled="creating"
            @click="handleFinish"
          >
            <Icon v-if="creating" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
            {{ creating ? 'Finishing...' : (invites.length > 0 ? 'Send Invites & Finish' : 'Finish') }}
          </button>
        </div>

        <!-- Step label -->
        <p class="text-center text-[10px] text-muted-foreground/50 mt-4 uppercase tracking-wider">
          Step {{ displayedStep }} of {{ totalSteps }}
        </p>
      </div>
    </div>
  </div>
</template>
