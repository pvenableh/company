<template>
  <Transition name="fade">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      @click.self="$emit('close')"
    >
      <Transition name="scale-up" appear>
        <div class="bg-background rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border">
          <!-- Header -->
          <div class="relative px-6 pt-6 pb-4">
            <button
              class="absolute right-4 top-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              @click="$emit('close')"
            >
              <Icon name="lucide:x" class="w-4 h-4" />
            </button>

            <div class="flex items-center gap-3 mb-1">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <Icon name="lucide:sparkles" class="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h2 class="text-lg font-semibold text-foreground">AI Email Generator</h2>
                <p class="text-xs text-muted-foreground">Describe your email and we'll create it for you</p>
              </div>
            </div>

            <!-- Step indicators -->
            <div v-if="step < 3" class="flex items-center gap-2 mt-4">
              <div
                v-for="s in 2"
                :key="s"
                class="flex-1 h-1 rounded-full transition-all duration-500"
                :class="s <= step ? 'bg-gradient-to-r from-violet-500 to-pink-500' : 'bg-muted'"
              />
            </div>
          </div>

          <!-- Step 1: What & Why -->
          <div v-if="step === 1" class="px-6 pb-6">
            <div class="space-y-5">
              <!-- Email type quick-picks -->
              <div>
                <label class="text-sm font-medium text-foreground mb-2.5 block">What kind of email?</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="t in emailTypes"
                    :key="t.value"
                    class="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-center"
                    :class="form.emailType === t.value
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20'"
                    @click="form.emailType = t.value"
                  >
                    <Icon :name="t.icon" class="w-5 h-5" :class="form.emailType === t.value ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground'" />
                    <span class="text-xs font-medium" :class="form.emailType === t.value ? 'text-violet-700 dark:text-violet-300' : 'text-foreground'">{{ t.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Topic / Description -->
              <div>
                <label class="text-sm font-medium text-foreground mb-1.5 block">What's this email about?</label>
                <textarea
                  v-model="form.topic"
                  rows="3"
                  placeholder="e.g. We're launching a new product line of eco-friendly water bottles. We want to invite our customers to check them out with a 20% launch discount..."
                  class="w-full rounded-xl border bg-background px-4 py-3 text-sm resize-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all placeholder:text-muted-foreground/60"
                />
              </div>

              <!-- Key points -->
              <div>
                <label class="text-sm font-medium text-foreground mb-1.5 block">
                  Key points to include
                  <span class="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  v-model="form.keyPoints"
                  rows="2"
                  placeholder="- Free shipping on orders over $50&#10;- Available in 5 colors&#10;- Made from recycled materials"
                  class="w-full rounded-xl border bg-background px-4 py-3 text-sm resize-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            <div class="flex justify-end mt-6">
              <Button
                :disabled="!form.topic.trim()"
                class="bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white border-0 shadow-lg shadow-violet-500/20 px-6"
                @click="step = 2"
              >
                Next
                <Icon name="lucide:arrow-right" class="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>

          <!-- Step 2: Audience & Tone -->
          <div v-if="step === 2" class="px-6 pb-6">
            <div class="space-y-5">
              <!-- Audience -->
              <div>
                <label class="text-sm font-medium text-foreground mb-2.5 block">Who's this for?</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="a in audiences"
                    :key="a.value"
                    class="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-center"
                    :class="form.audience === a.value
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20'"
                    @click="form.audience = a.value"
                  >
                    <Icon :name="a.icon" class="w-5 h-5" :class="form.audience === a.value ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground'" />
                    <span class="text-xs font-medium" :class="form.audience === a.value ? 'text-violet-700 dark:text-violet-300' : 'text-foreground'">{{ a.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Tone -->
              <div>
                <label class="text-sm font-medium text-foreground mb-2.5 block">What tone?</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="t in tones"
                    :key="t.value"
                    class="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-center"
                    :class="form.tone === t.value
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20'"
                    @click="form.tone = t.value"
                  >
                    <span class="text-lg">{{ t.emoji }}</span>
                    <span class="text-xs font-medium" :class="form.tone === t.value ? 'text-violet-700 dark:text-violet-300' : 'text-foreground'">{{ t.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Color Scheme -->
              <div>
                <label class="text-sm font-medium text-foreground mb-2.5 block">Color scheme</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="s in colorSchemes"
                    :key="s.value"
                    class="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-center"
                    :class="form.colorScheme === s.value
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20'"
                    @click="form.colorScheme = s.value"
                  >
                    <div class="flex gap-0.5">
                      <span
                        v-for="(c, ci) in s.colors"
                        :key="ci"
                        class="w-4 h-4 rounded-full border border-black/10"
                        :style="{ backgroundColor: c }"
                      />
                    </div>
                    <span class="text-xs font-medium" :class="form.colorScheme === s.value ? 'text-violet-700 dark:text-violet-300' : 'text-foreground'">{{ s.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Brand color (optional) -->
              <div>
                <label class="text-sm font-medium text-foreground mb-1.5 block">
                  Brand color
                  <span class="text-muted-foreground font-normal">(optional — overrides scheme accent)</span>
                </label>
                <div class="flex items-center gap-3">
                  <input
                    type="color"
                    :value="form.brandColor || '#6366f1'"
                    @input="form.brandColor = ($event.target as HTMLInputElement).value"
                    class="w-10 h-10 rounded-lg border cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    v-model="form.brandColor"
                    placeholder="#6366f1"
                    class="flex-1 rounded-xl border px-4 py-2.5 text-sm bg-background font-mono focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                  />
                  <div class="flex gap-1.5">
                    <button
                      v-for="c in presetColors"
                      :key="c"
                      class="w-7 h-7 rounded-lg border-2 transition-all hover:scale-110"
                      :class="form.brandColor === c ? 'border-foreground scale-110' : 'border-transparent'"
                      :style="{ backgroundColor: c }"
                      @click="form.brandColor = c"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div class="flex justify-between mt-6">
              <Button variant="ghost" @click="step = 1">
                <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1" />
                Back
              </Button>
              <Button
                class="bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white border-0 shadow-lg shadow-violet-500/20 px-6"
                @click="generate"
              >
                <Icon name="lucide:sparkles" class="w-4 h-4 mr-1" />
                Generate Email
              </Button>
            </div>
          </div>

          <!-- Step 3: Generating / Results -->
          <div v-if="step === 3" class="px-6 pb-6">
            <!-- Loading state -->
            <div v-if="generating" class="py-12 text-center">
              <div class="relative w-16 h-16 mx-auto mb-6">
                <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 animate-pulse opacity-30" />
                <div class="absolute inset-0 flex items-center justify-center">
                  <Icon name="lucide:sparkles" class="w-7 h-7 text-violet-600 dark:text-violet-400 animate-bounce" />
                </div>
              </div>
              <h3 class="font-semibold text-foreground mb-1">Crafting your email...</h3>
              <p class="text-sm text-muted-foreground max-w-xs mx-auto">
                Writing engaging copy, selecting the best layout, and preparing image suggestions
              </p>
              <div class="flex justify-center gap-1 mt-4">
                <div v-for="i in 3" :key="i" class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" :style="{ animationDelay: `${i * 150}ms` }" />
              </div>
            </div>

            <!-- Error state -->
            <div v-else-if="error" class="py-8 text-center">
              <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-destructive/10 flex items-center justify-center">
                <Icon name="lucide:alert-circle" class="w-6 h-6 text-destructive" />
              </div>
              <h3 class="font-semibold text-foreground mb-1">Generation failed</h3>
              <p class="text-sm text-muted-foreground mb-4">{{ error }}</p>
              <div class="flex justify-center gap-2">
                <Button variant="outline" @click="step = 2">
                  <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1" />
                  Go Back
                </Button>
                <Button
                  class="bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white border-0"
                  @click="generate"
                >
                  <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" />
                  Try Again
                </Button>
              </div>
            </div>

            <!-- Results -->
            <div v-else-if="result" class="space-y-4">
              <!-- Subject line -->
              <div class="rounded-xl border bg-muted/30 p-4">
                <label class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Subject Line</label>
                <input
                  v-model="result.subject"
                  class="w-full text-sm font-medium bg-transparent border-0 outline-none text-foreground"
                />
                <p v-if="result.previewText" class="text-xs text-muted-foreground mt-1 truncate">
                  Preview: {{ result.previewText }}
                </p>
              </div>

              <!-- Generated sections -->
              <div class="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                <div
                  v-for="(section, i) in result.sections"
                  :key="i"
                  class="group rounded-xl border bg-card p-4 transition-all hover:shadow-sm"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div
                        class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                        :class="getSectionStyle(section.blockCategory)"
                      >
                        {{ i + 1 }}
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="text-xs font-semibold text-foreground">{{ section.blockName }}</span>
                          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{{ section.blockCategory }}</span>
                        </div>
                        <p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {{ getSectionPreview(section) }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- Image suggestion -->
                  <div
                    v-if="section.imageSuggestion"
                    class="mt-2.5 flex items-start gap-2 px-2.5 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30"
                  >
                    <Icon name="lucide:image" class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p class="text-[11px] font-medium text-amber-800 dark:text-amber-300">{{ section.imageSuggestion.description }}</p>
                      <div class="flex flex-wrap gap-1 mt-1">
                        <span
                          v-for="term in section.imageSuggestion.searchTerms"
                          :key="term"
                          class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                        >
                          {{ term }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center justify-between pt-2 border-t">
                <Button variant="ghost" size="sm" @click="generate">
                  <Icon name="lucide:refresh-cw" class="w-3.5 h-3.5 mr-1" />
                  Regenerate
                </Button>
                <div class="flex gap-2">
                  <Button variant="outline" @click="$emit('close')">Cancel</Button>
                  <Button
                    class="bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white border-0 shadow-lg shadow-violet-500/20 px-6"
                    @click="applyToTemplate"
                  >
                    <Icon name="lucide:check" class="w-4 h-4 mr-1" />
                    Apply to Template
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';

const emit = defineEmits<{
  close: [];
  apply: [result: { subject: string; previewText: string; sections: any[] }];
}>();

const step = ref(1);
const generating = ref(false);
const error = ref('');
const result = ref<{ subject: string; previewText: string; sections: any[] } | null>(null);

const form = reactive({
  emailType: 'newsletter',
  topic: '',
  keyPoints: '',
  audience: 'customers',
  tone: 'professional',
  brandColor: '#6366f1',
  colorScheme: 'modern',
});

const emailTypes = [
  { value: 'newsletter', label: 'Newsletter', icon: 'lucide:newspaper' },
  { value: 'product-launch', label: 'Launch', icon: 'lucide:rocket' },
  { value: 'event-invite', label: 'Event', icon: 'lucide:calendar' },
  { value: 'promotion', label: 'Promo', icon: 'lucide:tag' },
  { value: 'announcement', label: 'Announce', icon: 'lucide:megaphone' },
  { value: 'welcome', label: 'Welcome', icon: 'lucide:hand-metal' },
  { value: 're-engagement', label: 'Win Back', icon: 'lucide:heart' },
  { value: 'update', label: 'Update', icon: 'lucide:bell' },
];

const audiences = [
  { value: 'customers', label: 'Customers', icon: 'lucide:users' },
  { value: 'prospects', label: 'Prospects', icon: 'lucide:user-search' },
  { value: 'subscribers', label: 'Subscribers', icon: 'lucide:mail' },
  { value: 'team', label: 'Team', icon: 'lucide:building-2' },
];

const tones = [
  { value: 'professional', label: 'Professional', emoji: '👔' },
  { value: 'friendly', label: 'Friendly', emoji: '😊' },
  { value: 'urgent', label: 'Urgent', emoji: '⚡' },
  { value: 'inspirational', label: 'Inspiring', emoji: '✨' },
];

const colorSchemes = [
  { value: 'classic', label: 'Classic', emoji: '🏛️', colors: ['#1a1a2e', '#16213e', '#e94560', '#f5f5f5'] },
  { value: 'modern', label: 'Modern', emoji: '✨', colors: ['#2d3436', '#6c5ce7', '#00cec9', '#f8f9fa'] },
  { value: 'casual', label: 'Casual', emoji: '🌊', colors: ['#2d3436', '#fd79a8', '#fdcb6e', '#ffeaa7'] },
  { value: 'clean', label: 'Clean', emoji: '🤍', colors: ['#333333', '#555555', '#0984e3', '#ffffff'] },
  { value: 'bright', label: 'Bright', emoji: '🌈', colors: ['#2d3436', '#e17055', '#00b894', '#ffeaa7'] },
  { value: 'dark', label: 'Dark', emoji: '🌙', colors: ['#f5f5f5', '#dfe6e9', '#a29bfe', '#2d3436'] },
  { value: 'warm', label: 'Warm', emoji: '🔥', colors: ['#2d3436', '#e17055', '#fab1a0', '#ffeaa7'] },
  { value: 'corporate', label: 'Corporate', emoji: '💼', colors: ['#2c3e50', '#2980b9', '#27ae60', '#ecf0f1'] },
];

const presetColors = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#ef4444', '#3b82f6'];

async function generate() {
  step.value = 3;
  generating.value = true;
  error.value = '';
  result.value = null;

  try {
    const data = await $fetch('/api/email/ai-generate', {
      method: 'POST',
      body: {
        emailType: form.emailType,
        topic: form.topic,
        keyPoints: form.keyPoints,
        audience: form.audience,
        tone: form.tone,
        brandColor: form.brandColor,
        colorScheme: form.colorScheme,
      },
    });
    result.value = data as any;
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Something went wrong. Please try again.';
  } finally {
    generating.value = false;
  }
}

function applyToTemplate() {
  if (result.value) {
    emit('apply', result.value);
  }
}

function getSectionPreview(section: any): string {
  if (!section.variables) return '';
  // Find the most content-rich variable to preview
  const contentKeys = ['title', 'heading', 'headline', 'text', 'body', 'content', 'description', 'subtitle', 'subheading'];
  for (const key of contentKeys) {
    for (const [vKey, vVal] of Object.entries(section.variables)) {
      if (vKey.toLowerCase().includes(key) && typeof vVal === 'string' && (vVal as string).length > 0) {
        return vVal as string;
      }
    }
  }
  // Fallback: first non-empty string variable
  const first = Object.values(section.variables).find(
    (v) => typeof v === 'string' && (v as string).length > 3 && !(v as string).startsWith('#') && v !== 'transparent',
  );
  return (first as string) || '';
}

function getSectionStyle(category: string): string {
  const styles: Record<string, string> = {
    hero: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    content: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'two-column': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    'three-column': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    cta: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    image: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    stats: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    quote: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    list: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    divider: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    social: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    header: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    footer: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
  };
  return styles[category] || 'bg-primary/10 text-primary';
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.scale-up-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.scale-up-leave-active {
  transition: all 0.2s ease;
}
.scale-up-enter-from {
  opacity: 0;
  transform: scale(0.92) translateY(10px);
}
.scale-up-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
</style>
