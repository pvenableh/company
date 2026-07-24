<!--
  MyCardPanel — slide-over for the current user's digital business card +
  booking link. Singleton (id sentinel '_'); opened from the user menu via
  useMyCard().open(), which pushes this panel. Edits the SAME cd_cards +
  scheduler_settings rows CardDesk and the public /c/[id] card read — one
  edit, live everywhere. Every field autosaves optimistically (no Save button);
  a pending debounced edit is flushed when the panel unmounts.

  Ported from Account/MyCardSheet.vue (the old bottom sheet).
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

defineProps<{ id: string; mode?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { data, loading, saving, savedAt, error, load, touch, flush } = useMyCard();
const toast = useToast();

// ── Derived preview bits ─────────────────────────────────────────────────────
const card = computed(() => data.value?.card ?? {});
function fileUrl(f: any, key = ''): string | null {
  const id = typeof f === 'object' ? f?.id : f;
  if (!id || !data.value?.assetsUrl) return null;
  return `${data.value.assetsUrl}/${id}${key ? `?key=${key}` : ''}`;
}
const imageUrl = computed(() => fileUrl(card.value.image, 'avatar'));
const coverUrl = computed(() => fileUrl(card.value.cover_image));
const logoUrl = computed(() => fileUrl(card.value.logo_image));

const SOCIALS: Array<{ key: string; icon: string; label: string }> = [
  { key: 'linkedin', icon: 'i-logos-linkedin-icon', label: 'LinkedIn' },
  { key: 'instagram', icon: 'i-logos-instagram-icon', label: 'Instagram' },
  { key: 'twitter', icon: 'i-logos-x', label: 'X / Twitter' },
  { key: 'youtube', icon: 'i-logos-youtube-icon', label: 'YouTube' },
  { key: 'behance', icon: 'i-logos-behance', label: 'Behance' },
];

const previewCard = computed(() => {
  const c: any = card.value;
  return {
    ...c,
    name: c.display_name || 'Your name',
    imageUrl: imageUrl.value,
    coverUrl: coverUrl.value,
    logoUrl: logoUrl.value,
    card_theme: c.card_theme || 'carddesk',
    flat_layout: !!c.flat_layout,
    booking: null,
  };
});

const PREVIEW_DEVICE_W = 390;
const previewWrapEl = ref<HTMLElement | null>(null);
const previewDeviceEl = ref<HTMLElement | null>(null);
const previewScale = ref(1);
const previewHeight = ref(0);
function measurePreview() {
  const wrap = previewWrapEl.value;
  const device = previewDeviceEl.value;
  if (!wrap || !device) return;
  previewScale.value = wrap.clientWidth / PREVIEW_DEVICE_W;
  previewHeight.value = device.offsetHeight * previewScale.value;
}
let previewRO: ResizeObserver | null = null;

onMounted(() => {
  load();
  previewRO = new ResizeObserver(() => measurePreview());
});
watch([previewWrapEl, previewDeviceEl], () => {
  if (!previewRO) return;
  if (previewWrapEl.value) previewRO.observe(previewWrapEl.value);
  if (previewDeviceEl.value) previewRO.observe(previewDeviceEl.value);
  measurePreview();
});
// Persist any pending debounced edit when the panel closes, then tear down.
onBeforeUnmount(() => {
  flush();
  previewRO?.disconnect();
});

const bookingUrl = computed(() => {
  const p = data.value?.bookingPath;
  if (!p) return null;
  return import.meta.client ? `${window.location.origin}${p}` : p;
});

// ── Share actions ────────────────────────────────────────────────────────────
async function copy(text: string | null | undefined, label: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ title: `${label} copied`, icon: 'i-lucide-check', color: 'green' });
  } catch {
    toast.add({ title: 'Could not copy', icon: 'i-lucide-alert-circle', color: 'red' });
  }
}
function openPublicCard() {
  if (data.value?.publicCardUrl) window.open(data.value.publicCardUrl, '_blank', 'noopener');
}
function downloadVcard() {
  const c = card.value;
  const esc = (v: any) => String(v || '').replace(/[,;\\]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const [first, ...rest] = String(c.display_name || '').trim().split(/\s+/);
  const last = rest.join(' ');
  const lines = [
    'BEGIN:VCARD', 'VERSION:3.0',
    `FN:${esc(c.display_name || 'Contact')}`,
    `N:${esc(last)};${esc(first)};;;`,
    c.title && `TITLE:${esc(c.title)}`,
    c.company && `ORG:${esc(c.company)}`,
    c.email && `EMAIL;TYPE=WORK:${esc(c.email)}`,
    c.phone && `TEL;TYPE=CELL:${esc(c.phone)}`,
    c.website && `URL:${esc(c.website)}`,
    c.office_address && `ADR;TYPE=WORK:;;${esc(c.office_address)};;;;`,
    c.headline && `NOTE:${esc(c.headline)}`,
    'END:VCARD',
  ].filter(Boolean);
  const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(c.display_name || 'card').replace(/\s+/g, '-').toLowerCase()}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <AppSlideOverShell title="My Card" subtitle="Your shareable business card & booking link" @close="emit('close')">
    <div v-if="loading && !data" class="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
      <EIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> Loading your card…
    </div>

    <div v-else-if="data" class="space-y-5 pb-2">
      <!-- Live preview -->
      <div
        ref="previewWrapEl"
        class="my-card-preview rounded-3xl overflow-hidden ring-1 ring-border/60 shadow-[0_10px_30px_-12px_rgb(0_0_0_/_0.25)]"
        :style="{ height: previewHeight ? previewHeight + 'px' : undefined }"
      >
        <div
          ref="previewDeviceEl"
          class="my-card-preview-device"
          :style="{ width: PREVIEW_DEVICE_W + 'px', transform: `scale(${previewScale})` }"
        >
          <CardView :card="previewCard" :interactive="false" />
        </div>
      </div>

      <!-- Share row -->
      <div class="flex flex-wrap gap-2">
        <button type="button" class="pill-action" @click="copy(data.publicCardUrl, 'Card link')">
          <EIcon name="i-lucide-link" class="w-3.5 h-3.5" /> Copy link
        </button>
        <button type="button" class="pill-action" @click="openPublicCard">
          <EIcon name="i-lucide-external-link" class="w-3.5 h-3.5" /> Open card
        </button>
        <button type="button" class="pill-action" @click="downloadVcard">
          <EIcon name="i-lucide-contact" class="w-3.5 h-3.5" /> vCard
        </button>
        <button v-if="data.booking.public_booking_enabled && bookingUrl" type="button" class="pill-action" @click="copy(bookingUrl, 'Booking link')">
          <EIcon name="i-lucide-calendar-clock" class="w-3.5 h-3.5" /> Copy booking link
        </button>
        <span class="ml-auto self-center text-[11px] text-muted-foreground">
          <template v-if="saving">Saving…</template>
          <template v-else-if="savedAt"><EIcon name="i-lucide-check" class="w-3 h-3 inline -mt-0.5" /> Saved</template>
        </span>
      </div>

      <!-- Card fields -->
      <section class="rounded-2xl border border-border/60 bg-background/40 p-4 space-y-2.5">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Card</p>
        <EInput v-model="card.display_name" placeholder="Display name" @update:model-value="touch" />
        <div class="grid grid-cols-2 gap-2.5">
          <EInput v-model="card.title" placeholder="Title" @update:model-value="touch" />
          <EInput v-model="card.company" placeholder="Company" @update:model-value="touch" />
        </div>
        <ETextarea v-model="card.headline" :rows="2" autoresize placeholder="Short tagline / headline" @update:model-value="touch" />
        <div class="grid grid-cols-2 gap-2.5">
          <EInput v-model="card.email" type="email" placeholder="Email" @update:model-value="touch" />
          <EInput v-model="card.phone" placeholder="Phone" @update:model-value="touch" />
        </div>
        <EInput v-model="card.website" placeholder="Website (https://…)" @update:model-value="touch" />
        <ETextarea v-model="card.office_address" :rows="2" autoresize placeholder="Office / business address" @update:model-value="touch" />
      </section>

      <!-- Socials -->
      <section class="rounded-2xl border border-border/60 bg-background/40 p-4 space-y-2.5">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Social</p>
        <div class="grid grid-cols-1 gap-2.5">
          <div v-for="s in SOCIALS" :key="s.key" class="flex items-center gap-2">
            <EIcon :name="s.icon" class="w-4 h-4 shrink-0" />
            <EInput v-model="card[s.key]" :placeholder="`${s.label} handle or URL`" class="flex-1" @update:model-value="touch" />
          </div>
        </div>
      </section>

      <!-- Design -->
      <section class="rounded-2xl border border-border/60 bg-background/40 p-4 space-y-3">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Design</p>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="t in CARD_THEMES"
            :key="t.id"
            type="button"
            class="relative flex flex-col items-center gap-1.5 p-2 rounded-xl border bg-muted/40 transition-transform hover:-translate-y-0.5"
            :class="(card.card_theme || 'carddesk') === t.id ? 'border-primary ring-1 ring-primary' : 'border-border/60'"
            @click="card.card_theme = t.id; touch()"
          >
            <span class="w-full aspect-[1/1.15] rounded-lg flex items-center justify-center bg-cover ring-1 ring-white/10" :style="{ background: t.swatch }">
              <span class="text-[15px] font-extrabold opacity-95" :style="{ fontFamily: `'Bauer Bodoni', Georgia, serif`, color: t.swatchInk }">Aa</span>
            </span>
            <span class="text-[11px] font-bold" :class="(card.card_theme || 'carddesk') === t.id ? 'text-foreground' : 'text-muted-foreground'">{{ t.label }}</span>
            <EIcon v-if="(card.card_theme || 'carddesk') === t.id" name="i-lucide-check" class="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-primary" />
          </button>
        </div>
        <p class="text-[11px] text-muted-foreground leading-relaxed">
          {{ CARD_THEMES.find((t) => t.id === (card.card_theme || 'carddesk'))?.hint }}
        </p>
        <div v-if="card.card_theme === 'glass' || card.card_theme === 'tech'" class="flex items-center justify-between gap-3 pt-1">
          <div>
            <p class="text-xs font-medium">Minimal rows</p>
            <p class="text-[11px] text-muted-foreground">Hide the boxed row backgrounds &amp; borders for a cleaner look.</p>
          </div>
          <EToggle v-model="card.flat_layout" @update:model-value="touch" />
        </div>
      </section>

      <!-- Booking -->
      <section class="rounded-2xl border border-border/60 bg-background/40 p-4 space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Booking</p>
          <EToggle v-model="data.booking.public_booking_enabled" @update:model-value="touch" />
        </div>
        <template v-if="data.booking.public_booking_enabled">
          <div v-if="data.bookingPath !== null || data.booking.booking_page_slug !== null">
            <EInput v-model="data.booking.booking_page_slug" placeholder="your-name (booking URL slug)" @update:model-value="touch" />
            <p v-if="bookingUrl" class="text-[11px] text-muted-foreground mt-1 truncate">
              <EIcon name="i-lucide-link" class="w-3 h-3 inline -mt-0.5" /> {{ bookingUrl }}
            </p>
            <p v-else class="text-[11px] text-amber-600 mt-1">Set an organization slug (Org settings) to activate your booking link.</p>
          </div>
          <EInput v-model="data.booking.booking_page_title" placeholder="Booking page title (optional)" @update:model-value="touch" />
          <ETextarea v-model="data.booking.booking_page_description" :rows="2" autoresize placeholder="What this meeting is for (optional)" @update:model-value="touch" />
          <p class="text-[11px] text-muted-foreground">
            <!-- allow-legacy-link — /scheduler/settings is a full settings page
                 (renders inside the apps shell via the apps-layout middleware),
                 not a slide-over panel; a plain link is correct here. -->
            Availability & meeting types live in <NuxtLink to="/scheduler/settings" class="text-primary hover:underline">Scheduler settings</NuxtLink>.
          </p>
        </template>
        <p v-else class="text-[11px] text-muted-foreground">Turn on to add a “Book a call” button to your card and share a booking link.</p>
      </section>

      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
      <p class="text-[11px] text-muted-foreground">
        Your card also lives on CardDesk and its public page — changes here show up there instantly.
      </p>
    </div>
  </AppSlideOverShell>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";
.pill-action {
  @apply inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-muted/50
    text-foreground hover:bg-muted transition-colors;
}
.my-card-preview-device {
  transform-origin: top left;
}
.my-card-preview :deep(.cv) {
  min-height: 0;
}
</style>
