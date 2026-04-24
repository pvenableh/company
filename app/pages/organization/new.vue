<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Building2, ChevronLeft, ChevronRight, Plus, X, Check, Sparkles } from 'lucide-vue-next'

definePageMeta({ middleware: ['auth'] })
useHead({ title: 'New Organization | Earnest' })

const { initializeOrganizations, setOrganization } = useOrganization()
const router = useRouter()

// ── Step state ──
const currentStep = ref(1)
const totalSteps = 4
const creating = ref(false)

// ── Form data ──
const orgName = ref('')
const selectedIndustry = ref<string | null>(null)
const selectedPlan = ref('solo')
const orgLocation = ref('')
const orgWebsite = ref('')
const orgBrandColor = ref('')
const invites = ref<{ email: string; role: string }[]>([])
const newInviteEmail = ref('')
const newInviteRole = ref('member')

// ── Industries (fetched from Directus) ──
const { list } = useDirectusItems('industries')
const industries = ref<{ id: string; name: string }[]>([])

onMounted(async () => {
  try {
    const data = await list({ fields: ['id', 'name'], sort: ['name'] })
    industries.value = data as any[]
  } catch {}
})

// ── Plans ──
const plans = [
  {
    key: 'solo',
    name: 'Solo',
    price: '49',
    desc: 'For the one-person shop doing serious work.',
    features: ['1 team seat', 'Every feature included', '100K Earnest tokens/month', '5 client portal seats'],
  },
  {
    key: 'studio',
    name: 'Studio',
    price: '149',
    desc: 'For the team that means business.',
    popular: true,
    features: ['8 team seats', 'Team channels & video', '400K Earnest tokens/month', '15 client portal seats'],
  },
  {
    key: 'agency',
    name: 'Agency',
    price: '299',
    desc: 'For the business that has grown into something real.',
    features: ['15 team seats', 'Priority support', '1M Earnest tokens/month', 'Unlimited client portals'],
  },
]

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
  if (currentStep.value < totalSteps && canProceed.value) {
    currentStep.value++
  }
}

function prevStep() {
  if (currentStep.value > 1) {
    currentStep.value--
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

// ── Create organization ──
async function handleCreate() {
  if (!orgName.value.trim()) return
  creating.value = true

  try {
    const result = await $fetch('/api/org/create', {
      method: 'POST',
      body: {
        name: orgName.value.trim(),
        plan: selectedPlan.value,
        industry: selectedIndustry.value,
        location: orgLocation.value.trim() || undefined,
        website: orgWebsite.value.trim() || undefined,
        brand_color: orgBrandColor.value.trim() || undefined,
      },
    }) as any

    // Send invites if any
    if (invites.value.length > 0 && result?.organization?.id) {
      for (const invite of invites.value) {
        try {
          await $fetch('/api/org/invite-member', {
            method: 'POST',
            body: {
              email: invite.email,
              roleSlug: invite.role,
              organizationId: result.organization.id,
            },
          })
        } catch {
          // Continue even if an invite fails
        }
      }
    }

    toast.success('Organization created!')

    // Refresh org list, select the new org, and redirect
    await initializeOrganizations()
    if (result?.organization?.id) {
      setOrganization(result.organization.id)
    }
    navigateTo('/', { external: true })
  } catch (err: any) {
    toast.error(err?.data?.message || 'Failed to create organization')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="flex min-h-svh items-center justify-center px-4 py-12">
    <div class="w-full max-w-xl">
      <div class="ios-card p-8">
        <!-- Step indicator -->
        <div class="flex items-center gap-1.5 mb-8">
          <div
            v-for="s in totalSteps"
            :key="s"
            class="flex-1 h-1 rounded-full transition-all duration-500"
            :class="s <= currentStep ? 'bg-[var(--cyan)]' : 'bg-muted/50'"
          />
        </div>

        <!-- ═══ STEP 1: Name + Industry ═══ -->
        <div v-if="currentStep === 1">
          <div class="text-center mb-8">
            <div class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
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
                class="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cyan)] focus:border-transparent"
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
                  class="px-3 py-2.5 rounded-lg text-[11px] font-medium text-left transition-all border"
                  :class="selectedIndustry === ind.id
                    ? 'border-[var(--cyan)] bg-cyan-50/50 text-foreground'
                    : 'border-gray-200 bg-white hover:border-gray-300 text-gray-600 hover:text-foreground'"
                  @click="selectedIndustry = ind.id"
                >
                  {{ ind.name }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ STEP 2: Plan Selection ═══ -->
        <div v-if="currentStep === 2">
          <div class="text-center mb-8">
            <div class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Sparkles class="w-6 h-6 text-gray-500" />
            </div>
            <h1 class="text-xl font-semibold">Choose Your Plan</h1>
            <p class="text-sm text-muted-foreground mt-1">You can change this anytime. All plans include every feature.</p>
          </div>

          <div class="space-y-3">
            <button
              v-for="plan in plans"
              :key="plan.key"
              class="w-full text-left p-4 rounded-xl border-2 transition-all relative"
              :class="selectedPlan === plan.key
                ? 'border-[var(--cyan)] bg-cyan-50/30'
                : 'border-gray-200 hover:border-gray-300 bg-white'"
              @click="selectedPlan = plan.key"
            >
              <!-- Popular badge -->
              <span
                v-if="plan.popular"
                class="absolute -top-2.5 right-4 text-[9px] font-bold uppercase tracking-wider bg-[var(--cyan)] text-white px-2.5 py-0.5 rounded-full"
              >Popular</span>

              <div class="flex items-start justify-between">
                <div class="flex-1">
                  <div class="flex items-baseline gap-2">
                    <span class="text-base font-bold">{{ plan.name }}</span>
                    <span class="text-lg font-bold">${{ plan.price }}</span>
                    <span class="text-xs text-muted-foreground">/mo</span>
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
            <div class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
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
                class="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cyan)] focus:border-transparent"
              />
            </div>

            <div>
              <label class="text-sm font-medium mb-1.5 block">Website</label>
              <input
                v-model="orgWebsite"
                type="text"
                placeholder="e.g. https://yourcompany.com"
                class="w-full rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cyan)] focus:border-transparent"
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
                  class="w-full rounded-lg border bg-background px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--cyan)] focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ STEP 4: Invite Team (Optional) ═══ -->
        <div v-if="currentStep === 4">
          <div class="text-center mb-8">
            <div class="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
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
                class="flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cyan)] focus:border-transparent"
                @keydown.enter.prevent="addInvite"
              />
              <select
                v-model="newInviteRole"
                class="rounded-lg border bg-background px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cyan)] focus:border-transparent"
              >
                <option v-for="r in roles" :key="r.value" :value="r.value">{{ r.label }}</option>
              </select>
              <button
                class="w-10 h-10 rounded-lg bg-[var(--cyan)] text-white flex items-center justify-center shrink-0 hover:opacity-90 transition-opacity disabled:opacity-40"
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
                  class="w-7 h-7 rounded-lg hover:bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
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
          <!-- Back -->
          <button
            v-if="currentStep > 1"
            class="flex items-center gap-1 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            @click="prevStep"
          >
            <ChevronLeft class="w-4 h-4" />
            Back
          </button>
          <button
            v-else
            class="flex items-center gap-1 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
            @click="router.back()"
          >
            Cancel
          </button>

          <div class="flex-1" />

          <!-- Skip (steps 3 & 4) -->
          <button
            v-if="currentStep === 3"
            class="px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            @click="nextStep"
          >
            Skip
          </button>

          <!-- Next / Create -->
          <button
            v-if="currentStep < totalSteps"
            class="flex items-center gap-1 px-6 py-2.5 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40"
            :disabled="!canProceed"
            @click="nextStep"
          >
            Continue
            <ChevronRight class="w-4 h-4" />
          </button>

          <button
            v-else
            class="flex items-center gap-1 px-6 py-2.5 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40"
            :disabled="creating"
            @click="handleCreate"
          >
            <Icon v-if="creating" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
            {{ creating ? 'Creating...' : (invites.length > 0 ? 'Create & Invite' : 'Create Organization') }}
          </button>
        </div>

        <!-- Step label -->
        <p class="text-center text-[10px] text-muted-foreground/50 mt-4 uppercase tracking-wider">
          Step {{ currentStep }} of {{ totalSteps }}
        </p>
      </div>
    </div>
  </div>
</template>
