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
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Icon name="lucide:sparkles" class="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h2 class="text-lg font-semibold text-foreground">AI Social Content</h2>
                <p class="text-xs text-muted-foreground">Generate platform-optimized posts with AI</p>
              </div>
            </div>

            <!-- Step indicators -->
            <div v-if="step < 3" class="flex items-center gap-2 mt-4">
              <div
                v-for="s in 2"
                :key="s"
                class="flex-1 h-1 rounded-full transition-all duration-500"
                :class="s <= step ? 'bg-gradient-to-r from-blue-500 to-cyan-500' : 'bg-muted'"
              />
            </div>
          </div>

          <!-- Step 1: What do you want to share? -->
          <div v-if="step === 1" class="px-6 pb-6">
            <div class="space-y-5">
              <!-- Platform selector (multi-select) -->
              <div>
                <label class="text-sm font-medium text-foreground mb-2.5 block">Which platforms?</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="p in platformOptions"
                    :key="p.value"
                    class="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-center relative"
                    :class="form.platforms.includes(p.value)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20'"
                    @click="togglePlatform(p.value)"
                  >
                    <Icon :name="p.icon" class="w-5 h-5" :class="form.platforms.includes(p.value) ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'" />
                    <span class="text-xs font-medium" :class="form.platforms.includes(p.value) ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'">{{ p.label }}</span>
                    <!-- Checkmark -->
                    <div
                      v-if="form.platforms.includes(p.value)"
                      class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center"
                    >
                      <Icon name="lucide:check" class="w-2.5 h-2.5 text-white" />
                    </div>
                  </button>
                </div>
              </div>

              <!-- Content type quick-picks -->
              <div>
                <label class="text-sm font-medium text-foreground mb-2.5 block">What kind of post?</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="t in contentTypes"
                    :key="t.value"
                    class="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-center"
                    :class="form.contentType === t.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20'"
                    @click="form.contentType = t.value"
                  >
                    <Icon :name="t.icon" class="w-5 h-5" :class="form.contentType === t.value ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'" />
                    <span class="text-xs font-medium" :class="form.contentType === t.value ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'">{{ t.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Topic -->
              <div>
                <label class="text-sm font-medium text-foreground mb-1.5 block">What do you want to share?</label>
                <textarea
                  v-model="form.topic"
                  rows="3"
                  placeholder="e.g. We just launched our new sustainable packaging initiative. We want to share the impact it'll have and invite people to learn more..."
                  class="w-full rounded-xl border bg-background px-4 py-3 text-sm resize-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-muted-foreground/60"
                />
              </div>

              <!-- Key points -->
              <div>
                <label class="text-sm font-medium text-foreground mb-1.5 block">
                  Key points
                  <span class="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  v-model="form.keyPoints"
                  rows="2"
                  placeholder="- 50% reduction in plastic waste&#10;- Partnership with local recyclers&#10;- Rolling out next month"
                  class="w-full rounded-xl border bg-background px-4 py-3 text-sm resize-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            <div class="flex justify-end mt-6">
              <Button
                :disabled="!canProceedStep1"
                class="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0 shadow-lg shadow-blue-500/20 px-6"
                @click="step = 2"
              >
                Next
                <Icon name="lucide:arrow-right" class="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>

          <!-- Step 2: Tone and style -->
          <div v-if="step === 2" class="px-6 pb-6">
            <div class="space-y-5">
              <!-- Tone -->
              <div>
                <label class="text-sm font-medium text-foreground mb-2.5 block">What tone?</label>
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <button
                    v-for="t in tones"
                    :key="t.value"
                    class="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-center"
                    :class="form.tone === t.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20'"
                    @click="form.tone = t.value"
                  >
                    <span class="text-lg">{{ t.emoji }}</span>
                    <span class="text-xs font-medium" :class="form.tone === t.value ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'">{{ t.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Audience -->
              <div>
                <label class="text-sm font-medium text-foreground mb-2.5 block">Who's this for?</label>
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <button
                    v-for="a in audiences"
                    :key="a.value"
                    class="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 transition-all text-center"
                    :class="form.audience === a.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted hover:border-muted-foreground/20'"
                    @click="form.audience = a.value"
                  >
                    <Icon :name="a.icon" class="w-5 h-5" :class="form.audience === a.value ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'" />
                    <span class="text-xs font-medium" :class="form.audience === a.value ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'">{{ a.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Brand voice -->
              <div>
                <label class="text-sm font-medium text-foreground mb-1.5 block">
                  Brand voice notes
                  <span class="text-muted-foreground font-normal">(optional)</span>
                </label>
                <textarea
                  v-model="form.brandVoice"
                  rows="2"
                  placeholder="e.g. We're a B2B SaaS company. Use 'we' not 'I'. Avoid jargon. Be confident but not arrogant."
                  class="w-full rounded-xl border bg-background px-4 py-3 text-sm resize-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-muted-foreground/60"
                />
              </div>

              <!-- CTA -->
              <div>
                <div class="flex items-center gap-3 mb-2">
                  <label class="text-sm font-medium text-foreground">Include a call-to-action?</label>
                  <button
                    class="relative w-10 h-5 rounded-full transition-colors"
                    :class="form.ctaEnabled ? 'bg-blue-500' : 'bg-muted'"
                    @click="form.ctaEnabled = !form.ctaEnabled"
                  >
                    <span
                      class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                      :class="form.ctaEnabled ? 'translate-x-5' : 'translate-x-0.5'"
                    />
                  </button>
                </div>
                <div v-if="form.ctaEnabled" class="flex flex-wrap gap-2">
                  <button
                    v-for="c in ctaTypes"
                    :key="c.value"
                    class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                    :class="form.ctaType === c.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                      : 'border-transparent bg-muted/50 text-foreground hover:bg-muted'"
                    @click="form.ctaType = c.value"
                  >
                    {{ c.label }}
                  </button>
                </div>
              </div>
            </div>

            <div class="flex justify-between mt-6">
              <Button variant="ghost" @click="step = 1">
                <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1" />
                Back
              </Button>
              <Button
                class="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0 shadow-lg shadow-blue-500/20 px-6"
                @click="generate"
              >
                <Icon name="lucide:sparkles" class="w-4 h-4 mr-1" />
                Generate Posts
              </Button>
            </div>
          </div>

          <!-- Step 3: Results -->
          <div v-if="step === 3" class="px-6 pb-6">
            <!-- Loading state -->
            <div v-if="generating" class="py-12 text-center">
              <div class="relative w-16 h-16 mx-auto mb-6">
                <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 animate-pulse opacity-30" />
                <div class="absolute inset-0 flex items-center justify-center">
                  <Icon name="lucide:sparkles" class="w-7 h-7 text-blue-600 dark:text-blue-400 animate-bounce" />
                </div>
              </div>
              <h3 class="font-semibold text-foreground mb-1">Crafting your posts...</h3>
              <p class="text-sm text-muted-foreground max-w-xs mx-auto">
                Writing platform-optimized content, selecting hashtags, and preparing image suggestions
              </p>
              <div class="flex justify-center gap-1 mt-4">
                <div v-for="i in 3" :key="i" class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" :style="{ animationDelay: `${i * 150}ms` }" />
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
                  class="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0"
                  @click="generate"
                >
                  <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-1" />
                  Try Again
                </Button>
              </div>
            </div>

            <!-- Results -->
            <div v-else-if="result" class="space-y-4">
              <!-- Platform tabs -->
              <Tabs v-model="activeTab">
                <TabsList class="bg-muted/50 p-1 rounded-xl w-full">
                  <TabsTrigger
                    v-for="post in result"
                    :key="post.platform"
                    :value="post.platform"
                    class="flex-1 !text-[11px]"
                  >
                    <Icon :name="getPlatformIcon(post.platform)" class="w-3.5 h-3.5" />
                    {{ getPlatformLabel(post.platform) }}
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  v-for="(post, index) in result"
                  :key="post.platform"
                  :value="post.platform"
                  class="space-y-3 mt-3"
                >
                  <!-- Editable content -->
                  <div class="rounded-xl border bg-muted/30 p-4">
                    <div class="flex items-center justify-between mb-2">
                      <label class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Post Content</label>
                      <span class="text-[11px] font-mono" :class="getCharCountClass(post)">
                        {{ post.content.length }} / {{ getCharLimit(post.platform) }}
                      </span>
                    </div>
                    <textarea
                      v-model="result[index].content"
                      rows="6"
                      class="w-full text-sm bg-transparent border-0 outline-none text-foreground resize-none"
                    />
                  </div>

                  <!-- Hashtags -->
                  <div class="rounded-xl border bg-muted/30 p-4">
                    <label class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Hashtags</label>
                    <div class="flex flex-wrap gap-1.5">
                      <span
                        v-for="(tag, tagIndex) in post.hashtags"
                        :key="tagIndex"
                        class="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      >
                        {{ tag }}
                        <button
                          class="hover:text-blue-900 dark:hover:text-blue-100"
                          @click="removeHashtag(index, tagIndex)"
                        >
                          <Icon name="lucide:x" class="w-3 h-3" />
                        </button>
                      </span>
                      <div class="inline-flex items-center">
                        <input
                          v-model="newHashtag"
                          placeholder="Add..."
                          class="w-20 text-xs bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground/60"
                          @keyup.enter="addHashtag(index)"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- CTA -->
                  <div v-if="post.cta" class="rounded-xl border bg-muted/30 p-4">
                    <label class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Call to Action</label>
                    <input
                      v-model="result[index].cta"
                      class="w-full text-sm bg-transparent border-0 outline-none text-foreground"
                    />
                  </div>

                  <!-- Image suggestion -->
                  <div
                    v-if="post.imageSuggestion"
                    class="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30"
                  >
                    <Icon name="lucide:image" class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p class="text-[11px] font-medium text-amber-800 dark:text-amber-300">{{ post.imageSuggestion.description }}</p>
                      <div class="flex flex-wrap gap-1 mt-1">
                        <span
                          v-for="term in post.imageSuggestion.searchTerms"
                          :key="term"
                          class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                        >
                          {{ term }}
                        </span>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              <!-- Actions -->
              <div class="flex items-center justify-between pt-2 border-t">
                <Button variant="ghost" size="sm" @click="generate">
                  <Icon name="lucide:refresh-cw" class="w-3.5 h-3.5 mr-1" />
                  Regenerate
                </Button>
                <div class="flex gap-2">
                  <Button variant="outline" @click="$emit('close')">Cancel</Button>
                  <Button
                    :disabled="creating"
                    :loading="creating"
                    class="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0 shadow-lg shadow-blue-500/20 px-6"
                    @click="createPosts"
                  >
                    <Icon name="lucide:check" class="w-4 h-4 mr-1" />
                    Create {{ result.length }} Draft{{ result.length !== 1 ? 's' : '' }}
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import type {
  SocialPlatform,
  SocialContentType,
  SocialTone,
  SocialAudience,
  SocialCTAType,
  SocialAIGeneratedPost,
  SocialAIGenerateResponse,
} from '~/types/social';

const emit = defineEmits<{
  close: [];
  created: [posts: { platform: SocialPlatform; caption: string }[]];
}>();

const step = ref(1);
const generating = ref(false);
const creating = ref(false);
const error = ref('');
const result = ref<SocialAIGeneratedPost[] | null>(null);
const activeTab = ref<string>('linkedin');
const newHashtag = ref('');

const form = reactive({
  platforms: [] as SocialPlatform[],
  contentType: 'announcement' as SocialContentType,
  topic: '',
  keyPoints: '',
  tone: 'professional' as SocialTone,
  audience: 'clients' as SocialAudience,
  brandVoice: '',
  ctaEnabled: false,
  ctaType: 'visit-website' as SocialCTAType,
});

const platformOptions = [
  { value: 'linkedin' as SocialPlatform, label: 'LinkedIn', icon: 'lucide:linkedin' },
  { value: 'facebook' as SocialPlatform, label: 'Facebook', icon: 'lucide:facebook' },
  { value: 'threads' as SocialPlatform, label: 'Threads', icon: 'lucide:at-sign' },
  { value: 'instagram' as SocialPlatform, label: 'Instagram', icon: 'lucide:instagram' },
];

const contentTypes = [
  { value: 'announcement', label: 'Announcement', icon: 'lucide:megaphone' },
  { value: 'behind-the-scenes', label: 'Behind Scenes', icon: 'lucide:camera' },
  { value: 'promotion', label: 'Promotion', icon: 'lucide:tag' },
  { value: 'thought-leadership', label: 'Thought Lead', icon: 'lucide:lightbulb' },
  { value: 'event', label: 'Event', icon: 'lucide:calendar' },
  { value: 'case-study', label: 'Case Study', icon: 'lucide:file-text' },
  { value: 'team-spotlight', label: 'Team Spotlight', icon: 'lucide:users' },
  { value: 'industry-news', label: 'Industry News', icon: 'lucide:newspaper' },
];

const tones = [
  { value: 'professional', label: 'Professional', emoji: '\uD83D\uDC54' },
  { value: 'casual', label: 'Casual', emoji: '\uD83D\uDE0A' },
  { value: 'playful', label: 'Playful', emoji: '\uD83C\uDF89' },
  { value: 'urgent', label: 'Urgent', emoji: '\u26A1' },
  { value: 'inspirational', label: 'Inspiring', emoji: '\u2728' },
];

const audiences = [
  { value: 'clients', label: 'Clients', icon: 'lucide:users' },
  { value: 'prospects', label: 'Prospects', icon: 'lucide:user-search' },
  { value: 'industry-peers', label: 'Industry', icon: 'lucide:building-2' },
  { value: 'general-public', label: 'General', icon: 'lucide:globe' },
  { value: 'team', label: 'Team', icon: 'lucide:hard-hat' },
];

const ctaTypes = [
  { value: 'visit-website', label: 'Visit Website' },
  { value: 'book-a-call', label: 'Book a Call' },
  { value: 'learn-more', label: 'Learn More' },
  { value: 'shop-now', label: 'Shop Now' },
];

const canProceedStep1 = computed(() => form.platforms.length > 0 && form.topic.trim().length > 0);

function togglePlatform(platform: SocialPlatform) {
  const index = form.platforms.indexOf(platform);
  if (index === -1) {
    form.platforms.push(platform);
  } else {
    form.platforms.splice(index, 1);
  }
}

function getPlatformIcon(platform: SocialPlatform): string {
  const icons: Record<SocialPlatform, string> = {
    linkedin: 'lucide:linkedin',
    facebook: 'lucide:facebook',
    threads: 'lucide:at-sign',
    instagram: 'lucide:instagram',
    tiktok: 'lucide:music',
  };
  return icons[platform] || 'lucide:globe';
}

function getPlatformLabel(platform: SocialPlatform): string {
  const labels: Record<SocialPlatform, string> = {
    linkedin: 'LinkedIn',
    facebook: 'Facebook',
    threads: 'Threads',
    instagram: 'Instagram',
    tiktok: 'TikTok',
  };
  return labels[platform] || platform;
}

function getCharLimit(platform: SocialPlatform): string {
  const limits: Record<SocialPlatform, string> = {
    linkedin: '3,000',
    facebook: '63,206',
    threads: '500',
    instagram: '2,200',
    tiktok: '4,000',
  };
  return limits[platform] || '4,000';
}

function getCharCountClass(post: SocialAIGeneratedPost): string {
  const limits: Record<SocialPlatform, number> = {
    linkedin: 3000,
    facebook: 63206,
    threads: 500,
    instagram: 2200,
    tiktok: 4000,
  };
  const limit = limits[post.platform] || 4000;
  return post.content.length > limit ? 'text-red-500' : 'text-muted-foreground';
}

function removeHashtag(postIndex: number, tagIndex: number) {
  if (result.value) {
    result.value[postIndex].hashtags.splice(tagIndex, 1);
  }
}

function addHashtag(postIndex: number) {
  if (!result.value || !newHashtag.value.trim()) return;
  let tag = newHashtag.value.trim();
  if (!tag.startsWith('#')) tag = `#${tag}`;
  result.value[postIndex].hashtags.push(tag);
  newHashtag.value = '';
}

async function generate() {
  step.value = 3;
  generating.value = true;
  error.value = '';
  result.value = null;

  try {
    const data = await $fetch('/api/social/ai-generate', {
      method: 'POST',
      body: {
        platforms: form.platforms,
        contentType: form.contentType,
        topic: form.topic,
        keyPoints: form.keyPoints,
        tone: form.tone,
        audience: form.audience,
        brandVoice: form.brandVoice,
        ctaType: form.ctaEnabled ? form.ctaType : undefined,
      },
    });

    const response = data as SocialAIGenerateResponse;
    result.value = response.posts;

    if (result.value.length > 0) {
      activeTab.value = result.value[0].platform;
    }
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Something went wrong. Please try again.';
  } finally {
    generating.value = false;
  }
}

async function createPosts() {
  if (!result.value) return;
  creating.value = true;

  try {
    const createdPosts: { platform: SocialPlatform; caption: string }[] = [];

    for (const post of result.value) {
      const hashtagString = post.hashtags.length > 0
        ? '\n\n' + post.hashtags.join(' ')
        : '';
      const fullCaption = post.content + hashtagString;

      await $fetch('/api/social/posts', {
        method: 'POST',
        body: {
          caption: fullCaption,
          media_urls: [],
          media_types: [],
          platforms: [{ platform: post.platform }],
          post_type: 'text',
          status: 'draft',
        },
      });

      createdPosts.push({ platform: post.platform, caption: fullCaption });
    }

    emit('created', createdPosts);
  } catch (err: any) {
    error.value = err?.data?.message || 'Failed to create draft posts.';
    creating.value = false;
  }
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
</style>
