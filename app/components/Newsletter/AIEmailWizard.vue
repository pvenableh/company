<template>
  <Transition name="fade">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      @click.self="$emit('close')"
    >
      <Transition name="scale-up" appear>
        <div class="ios-card w-full max-w-2xl mx-4 shadow-xl overflow-hidden">
          <!-- Header -->
          <div class="relative px-5 pt-5 pb-4 border-b border-border/30">
            <button
              class="absolute right-4 top-4 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted ios-press transition-colors"
              @click="$emit('close')"
            >
              <Icon name="lucide:x" class="w-3.5 h-3.5" />
            </button>

            <div class="flex items-center gap-3 mb-1">
              <div class="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Icon name="lucide:sparkles" class="w-4 h-4 text-violet-500" />
              </div>
              <div>
                <h2 class="text-sm font-semibold text-foreground">AI Email Generator</h2>
                <p class="text-[10px] text-muted-foreground">Describe your email and we'll create it</p>
              </div>
            </div>

            <!-- Step indicators -->
            <div v-if="step < 3" class="flex items-center gap-2 mt-4">
              <div
                v-for="s in 2"
                :key="s"
                class="flex-1 h-1 rounded-full transition-all duration-500"
                :class="s <= step ? 'bg-violet-500' : 'bg-muted'"
              />
            </div>
          </div>

          <!-- Step 1: What & Why -->
          <div v-if="step === 1" class="px-5 pb-5">
            <div class="space-y-4 mt-4">
              <!-- Email type -->
              <div>
                <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">What kind of email?</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="t in emailTypes"
                    :key="t.value"
                    class="ios-card flex flex-col items-center gap-1.5 px-3 py-3 text-center transition-all"
                    :class="form.emailType === t.value
                      ? 'ring-2 ring-violet-500 ring-offset-1 bg-violet-50/50 dark:bg-violet-900/20'
                      : 'hover:shadow-md'"
                    @click="form.emailType = t.value"
                  >
                    <Icon :name="t.icon" class="w-4 h-4" :class="form.emailType === t.value ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground'" />
                    <span class="text-[10px] font-medium" :class="form.emailType === t.value ? 'text-violet-700 dark:text-violet-300' : 'text-foreground'">{{ t.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Topic -->
              <div>
                <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">What's this email about?</label>
                <textarea
                  v-model="form.topic"
                  rows="3"
                  placeholder="e.g. We're launching a new product line of eco-friendly water bottles..."
                  class="w-full rounded-xl border bg-background px-3 py-2.5 text-sm resize-none focus:ring-1 focus:ring-violet-500/30 outline-none transition-all placeholder:text-muted-foreground/50"
                />
              </div>

              <!-- Key points -->
              <div>
                <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Key points <span class="font-normal normal-case">(optional)</span>
                </label>
                <textarea
                  v-model="form.keyPoints"
                  rows="2"
                  placeholder="- Free shipping on orders over $50&#10;- Available in 5 colors"
                  class="w-full rounded-xl border bg-background px-3 py-2.5 text-sm resize-none focus:ring-1 focus:ring-violet-500/30 outline-none transition-all placeholder:text-muted-foreground/50"
                />
              </div>
            </div>

            <div class="flex justify-end mt-5">
              <button
                class="rounded-full px-4 py-2 text-[11px] font-medium bg-violet-600 text-white hover:bg-violet-700 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5 disabled:opacity-40"
                :disabled="!form.topic.trim()"
                @click="step = 2"
              >
                Next <Icon name="lucide:arrow-right" class="w-3 h-3" />
              </button>
            </div>
          </div>

          <!-- Step 2: Audience & Tone -->
          <div v-if="step === 2" class="px-5 pb-5">
            <div class="space-y-4 mt-4">
              <!-- Audience -->
              <div>
                <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Who's this for?</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="a in audiences"
                    :key="a.value"
                    class="ios-card flex flex-col items-center gap-1.5 px-3 py-3 text-center transition-all"
                    :class="form.audience === a.value
                      ? 'ring-2 ring-violet-500 ring-offset-1 bg-violet-50/50 dark:bg-violet-900/20'
                      : 'hover:shadow-md'"
                    @click="form.audience = a.value"
                  >
                    <Icon :name="a.icon" class="w-4 h-4" :class="form.audience === a.value ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground'" />
                    <span class="text-[10px] font-medium" :class="form.audience === a.value ? 'text-violet-700 dark:text-violet-300' : 'text-foreground'">{{ a.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Tone -->
              <div>
                <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">What tone?</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="t in tones"
                    :key="t.value"
                    class="ios-card flex flex-col items-center gap-1.5 px-3 py-3 text-center transition-all"
                    :class="form.tone === t.value
                      ? 'ring-2 ring-violet-500 ring-offset-1 bg-violet-50/50 dark:bg-violet-900/20'
                      : 'hover:shadow-md'"
                    @click="form.tone = t.value"
                  >
                    <span class="text-base">{{ t.emoji }}</span>
                    <span class="text-[10px] font-medium" :class="form.tone === t.value ? 'text-violet-700 dark:text-violet-300' : 'text-foreground'">{{ t.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Color Scheme -->
              <div>
                <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Color scheme</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="s in colorSchemes"
                    :key="s.value"
                    class="ios-card flex flex-col items-center gap-1.5 px-3 py-3 text-center transition-all"
                    :class="form.colorScheme === s.value
                      ? 'ring-2 ring-violet-500 ring-offset-1 bg-violet-50/50 dark:bg-violet-900/20'
                      : 'hover:shadow-md'"
                    @click="form.colorScheme = s.value"
                  >
                    <div class="flex gap-0.5">
                      <span
                        v-for="(c, ci) in s.colors"
                        :key="ci"
                        class="w-3.5 h-3.5 rounded-full border border-black/10"
                        :style="{ backgroundColor: c }"
                      />
                    </div>
                    <span class="text-[10px] font-medium" :class="form.colorScheme === s.value ? 'text-violet-700 dark:text-violet-300' : 'text-foreground'">{{ s.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Custom color pickers -->
              <div v-if="form.colorScheme === 'custom'" class="space-y-3">
                <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">Pick your colors</label>
                <div class="flex gap-4">
                  <div class="flex-1">
                    <label class="text-[10px] text-muted-foreground mb-1 block">Text</label>
                    <div class="flex items-center gap-2">
                      <input type="color" v-model="customColors.text" class="w-8 h-8 rounded-lg border cursor-pointer" />
                      <input type="text" v-model="customColors.text" class="flex-1 rounded-lg border px-2 py-1.5 text-xs font-mono bg-background" />
                    </div>
                  </div>
                  <div class="flex-1">
                    <label class="text-[10px] text-muted-foreground mb-1 block">Accent</label>
                    <div class="flex items-center gap-2">
                      <input type="color" v-model="customColors.accent" class="w-8 h-8 rounded-lg border cursor-pointer" />
                      <input type="text" v-model="customColors.accent" class="flex-1 rounded-lg border px-2 py-1.5 text-xs font-mono bg-background" />
                    </div>
                  </div>
                  <div v-if="form.colorCount === 3" class="flex-1">
                    <label class="text-[10px] text-muted-foreground mb-1 block">Background</label>
                    <div class="flex items-center gap-2">
                      <input type="color" v-model="customColors.background" class="w-8 h-8 rounded-lg border cursor-pointer" />
                      <input type="text" v-model="customColors.background" class="flex-1 rounded-lg border px-2 py-1.5 text-xs font-mono bg-background" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Number of colors -->
              <div>
                <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">How many colors?</label>
                <div class="bg-muted/40 rounded-full p-0.5 flex gap-0.5 w-fit">
                  <button
                    v-for="n in [2, 3]"
                    :key="n"
                    class="rounded-full px-3.5 py-1.5 text-[11px] font-medium transition-all inline-flex items-center gap-1.5"
                    :class="form.colorCount === n ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'"
                    @click="form.colorCount = n"
                  >
                    <div class="flex gap-0.5">
                      <span
                        v-for="i in n"
                        :key="i"
                        class="w-3 h-3 rounded-full"
                        :style="{ backgroundColor: selectedSchemeColors[i - 1] || '#ccc' }"
                      />
                    </div>
                    {{ n }} colors
                  </button>
                </div>
              </div>

              <!-- Brand color -->
              <div>
                <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Brand color <span class="font-normal normal-case">(optional)</span>
                </label>
                <div class="flex items-center gap-3">
                  <input
                    type="color"
                    :value="form.brandColor || '#6366f1'"
                    @input="form.brandColor = ($event.target as HTMLInputElement).value"
                    class="w-9 h-9 rounded-xl border cursor-pointer shrink-0"
                  />
                  <input
                    type="text"
                    v-model="form.brandColor"
                    placeholder="#6366f1"
                    class="flex-1 rounded-xl border px-3 py-2 text-sm bg-background font-mono focus:ring-1 focus:ring-violet-500/30 outline-none transition-all"
                  />
                  <div class="flex gap-1">
                    <button
                      v-for="c in presetColors"
                      :key="c"
                      class="w-6 h-6 rounded-lg border-2 transition-all hover:scale-110 ios-press"
                      :class="form.brandColor === c ? 'border-foreground scale-110' : 'border-transparent'"
                      :style="{ backgroundColor: c }"
                      @click="form.brandColor = c"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div class="flex justify-between mt-5">
              <button class="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted ios-press transition-colors inline-flex items-center gap-1" @click="step = 1">
                <Icon name="lucide:arrow-left" class="w-3 h-3" /> Back
              </button>
              <button
                class="rounded-full px-4 py-2 text-[11px] font-medium bg-violet-600 text-white hover:bg-violet-700 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5"
                @click="generate"
              >
                <Icon name="lucide:sparkles" class="w-3 h-3" /> Generate Email
              </button>
            </div>
          </div>

          <!-- Step 3: Generating / Results -->
          <div v-if="step === 3" class="px-5 pb-5">
            <!-- Loading -->
            <div v-if="generating" class="py-12 text-center">
              <div class="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
                <Icon name="lucide:sparkles" class="w-6 h-6 text-violet-500 animate-bounce" />
              </div>
              <h3 class="text-sm font-semibold text-foreground mb-1">Crafting your email...</h3>
              <p class="text-xs text-muted-foreground max-w-xs mx-auto">
                Writing copy, selecting layout, and preparing images
              </p>
              <div class="flex justify-center gap-1 mt-4">
                <div v-for="i in 3" :key="i" class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-bounce" :style="{ animationDelay: `${i * 150}ms` }" />
              </div>
            </div>

            <!-- Error -->
            <div v-else-if="error" class="py-8 text-center">
              <div class="w-12 h-12 mx-auto mb-4 rounded-2xl bg-destructive/10 flex items-center justify-center">
                <Icon name="lucide:alert-circle" class="w-5 h-5 text-destructive" />
              </div>
              <h3 class="text-sm font-semibold text-foreground mb-1">Generation failed</h3>
              <p class="text-xs text-muted-foreground mb-4">{{ error }}</p>
              <div class="flex justify-center gap-2">
                <button class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press transition-colors inline-flex items-center gap-1" @click="step = 2">
                  <Icon name="lucide:arrow-left" class="w-3 h-3" /> Go Back
                </button>
                <button
                  class="rounded-full px-3 py-1.5 text-[11px] font-medium bg-violet-600 text-white hover:bg-violet-700 ios-press shadow-sm transition-colors inline-flex items-center gap-1"
                  @click="generate"
                >
                  <Icon name="lucide:refresh-cw" class="w-3 h-3" /> Try Again
                </button>
              </div>
            </div>

            <!-- Results -->
            <div v-else-if="result" class="space-y-4 mt-4">
              <!-- Subject line -->
              <div class="ios-card p-4 bg-muted/20">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Subject Line</label>
                <input
                  v-model="result.subject"
                  class="w-full text-sm font-medium bg-transparent border-0 outline-none text-foreground"
                />
                <p v-if="result.previewText" class="text-[10px] text-muted-foreground mt-1 truncate">
                  Preview: {{ result.previewText }}
                </p>
              </div>

              <!-- Sections -->
              <div class="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                <div
                  v-for="(section, i) in result.sections"
                  :key="i"
                  class="ios-card p-4 transition-all"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div
                        class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold"
                        :class="getSectionStyle(section.blockCategory)"
                      >
                        {{ i + 1 }}
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="text-xs font-semibold text-foreground">{{ section.blockName }}</span>
                          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{{ section.blockCategory }}</span>
                        </div>
                        <p class="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                          {{ getSectionPreview(section) }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- Image suggestion -->
                  <div
                    v-if="section.imageSuggestion"
                    class="mt-2.5 flex items-start gap-2 px-2.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30"
                  >
                    <Icon name="lucide:image" class="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p class="text-[10px] font-medium text-amber-800 dark:text-amber-300">{{ section.imageSuggestion.description }}</p>
                      <div class="flex flex-wrap gap-1 mt-1">
                        <span
                          v-for="term in section.imageSuggestion.searchTerms"
                          :key="term"
                          class="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                        >
                          {{ term }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center justify-between pt-3 border-t border-border/30">
                <button class="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted ios-press transition-colors inline-flex items-center gap-1" @click="generate">
                  <Icon name="lucide:refresh-cw" class="w-3 h-3" /> Regenerate
                </button>
                <div class="flex gap-2">
                  <button class="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted ios-press transition-colors" @click="$emit('close')">Cancel</button>
                  <button
                    class="rounded-full px-4 py-2 text-[11px] font-medium bg-violet-600 text-white hover:bg-violet-700 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5"
                    @click="applyToTemplate"
                  >
                    <Icon name="lucide:check" class="w-3 h-3" /> Apply to Template
                  </button>
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
  colorCount: 3,
});

const selectedSchemeColors = computed(() => {
  if (form.colorScheme === 'custom') {
    return [customColors.text, customColors.accent, customColors.background];
  }
  const scheme = colorSchemes.find(s => s.value === form.colorScheme);
  return scheme?.colors || [];
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
  { value: 'custom', label: 'Custom', emoji: '🎨', colors: ['#333333', '#f97316', '#ffffff', '#f5f5f5'] },
  { value: 'classic', label: 'Classic', emoji: '🏛️', colors: ['#1a1a2e', '#16213e', '#e94560', '#f5f5f5'] },
  { value: 'modern', label: 'Modern', emoji: '✨', colors: ['#2d3436', '#6c5ce7', '#00cec9', '#f8f9fa'] },
  { value: 'casual', label: 'Casual', emoji: '🌊', colors: ['#2d3436', '#fd79a8', '#fdcb6e', '#ffeaa7'] },
  { value: 'clean', label: 'Clean', emoji: '🤍', colors: ['#333333', '#555555', '#0984e3', '#ffffff'] },
  { value: 'bright', label: 'Bright', emoji: '🌈', colors: ['#2d3436', '#e17055', '#00b894', '#ffeaa7'] },
  { value: 'dark', label: 'Dark', emoji: '🌙', colors: ['#f5f5f5', '#dfe6e9', '#a29bfe', '#2d3436'] },
  { value: 'warm', label: 'Warm', emoji: '🔥', colors: ['#2d3436', '#e17055', '#fab1a0', '#ffeaa7'] },
  { value: 'corporate', label: 'Corporate', emoji: '💼', colors: ['#2c3e50', '#2980b9', '#27ae60', '#ecf0f1'] },
];

const customColors = reactive({
  text: '#333333',
  accent: '#f97316',
  background: '#ffffff',
});

const presetColors = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#ef4444', '#3b82f6'];

async function generate() {
  step.value = 3;
  generating.value = true;
  error.value = '';
  result.value = null;

  try {
    const isCustom = form.colorScheme === 'custom';
    const data = await $fetch('/api/email/ai-generate', {
      method: 'POST',
      body: {
        emailType: form.emailType,
        topic: form.topic,
        keyPoints: form.keyPoints,
        audience: form.audience,
        tone: form.tone,
        brandColor: isCustom ? customColors.accent : form.brandColor,
        colorScheme: isCustom ? 'custom' : form.colorScheme,
        colorCount: form.colorCount,
        ...(isCustom && {
          customColors: {
            text: customColors.text,
            accent: customColors.accent,
            background: customColors.background,
          },
        }),
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
  const contentKeys = ['title', 'heading', 'headline', 'text', 'body', 'content', 'description', 'subtitle', 'subheading'];
  for (const key of contentKeys) {
    for (const [vKey, vVal] of Object.entries(section.variables)) {
      if (vKey.toLowerCase().includes(key) && typeof vVal === 'string' && (vVal as string).length > 0) {
        return vVal as string;
      }
    }
  }
  const first = Object.values(section.variables).find(
    (v) => typeof v === 'string' && (v as string).length > 3 && !(v as string).startsWith('#') && v !== 'transparent',
  );
  return (first as string) || '';
}

function getSectionStyle(category: string): string {
  const styles: Record<string, string> = {
    hero: 'bg-violet-500/10 text-violet-600',
    content: 'bg-green-500/10 text-green-600',
    'two-column': 'bg-amber-500/10 text-amber-600',
    'three-column': 'bg-amber-500/10 text-amber-600',
    cta: 'bg-red-500/10 text-red-600',
    image: 'bg-cyan-500/10 text-cyan-600',
    stats: 'bg-indigo-500/10 text-indigo-600',
    quote: 'bg-pink-500/10 text-pink-600',
    list: 'bg-teal-500/10 text-teal-600',
    divider: 'bg-gray-500/10 text-gray-600',
    social: 'bg-sky-500/10 text-sky-600',
    header: 'bg-blue-500/10 text-blue-600',
    footer: 'bg-slate-500/10 text-slate-600',
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
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.scale-up-leave-active {
  transition: all 0.2s ease;
}
.scale-up-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(8px);
}
.scale-up-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
</style>
