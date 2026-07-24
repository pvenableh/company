<script setup lang="ts">
defineProps<{
  disabled?: boolean
  mediaDisabled?: boolean
  hint?: string | null
}>()

const emit = defineEmits<{
  send: [payload: { text?: string; mediaUrl?: string; mediaType?: 'image' | 'video' | 'audio' | 'file' }]
}>()

const text = ref('')
const sending = ref(false)
const showPicker = ref(false)
const attachment = ref<{ url: string; type: 'image' | 'video' } | null>(null)

const canSend = computed(() => (!!text.value.trim() || !!attachment.value) && !sending.value)

async function submit() {
  if (!canSend.value) return
  sending.value = true
  try {
    emit('send', {
      text: text.value.trim() || undefined,
      mediaUrl: attachment.value?.url,
      mediaType: attachment.value?.type,
    })
    text.value = ''
    attachment.value = null
  } finally {
    sending.value = false
  }
}

function onEnter(e: KeyboardEvent) {
  if (e.shiftKey) return
  e.preventDefault()
  submit()
}

function onPicked(files: { url: string; type: 'image' | 'video' }[]) {
  // Single attachment per message — Meta's Send API accepts one attachment per call
  if (files[0]) attachment.value = files[0]
  showPicker.value = false
}
</script>

<template>
  <div class="border-t border-border p-3">
    <p v-if="hint" class="mb-2 text-[11px] text-warning dark:text-warning">{{ hint }}</p>

    <!-- Attachment chip -->
    <div v-if="attachment" class="mb-2 inline-flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1">
      <img
        v-if="attachment.type === 'image'"
        :src="attachment.url"
        class="h-8 w-8 rounded object-cover"
        alt=""
      />
      <Icon v-else name="i-lucide-video" class="h-4 w-4 text-muted-foreground" />
      <span class="max-w-[200px] truncate text-xs text-muted-foreground">
        {{ attachment.type }} attachment
      </span>
      <button
        class="text-muted-foreground hover:text-foreground"
        @click="attachment = null"
      >
        <Icon name="i-lucide-x" class="h-3.5 w-3.5" />
      </button>
    </div>

    <div class="flex items-end gap-2">
      <button
        type="button"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="disabled || mediaDisabled"
        :title="mediaDisabled ? 'Media replies aren\'t supported on this platform' : 'Attach media'"
        @click="showPicker = true"
      >
        <Icon name="i-lucide-paperclip" class="h-4 w-4" />
      </button>

      <textarea
        v-model="text"
        rows="2"
        placeholder="Reply… (Shift+Enter for newline)"
        class="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
        :disabled="disabled"
        @keydown.enter="onEnter"
      />
      <EButton
        :loading="sending"
        :disabled="!canSend || disabled"
        size="sm"
        icon="i-lucide-send"
        @click="submit"
      >
        Send
      </EButton>
    </div>

    <SocialMediaFilePicker
      v-if="showPicker"
      @picked="onPicked"
      @close="showPicker = false"
    />
  </div>
</template>
