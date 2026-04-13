<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" @click.self="$emit('close')">
    <div class="ios-card w-full max-w-md mx-4 shadow-xl overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-border/30">
        <h3 class="text-sm font-semibold">Send Test Email</h3>
        <button class="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted ios-press transition-colors" @click="$emit('close')">
          <Icon name="lucide:x" class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="px-5 py-4 space-y-4">
        <div class="space-y-1.5">
          <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Recipient Email</label>
          <input
            v-model="email"
            type="email"
            placeholder="test@example.com"
            class="w-full rounded-xl border px-3 py-2.5 text-sm bg-background focus:ring-1 focus:ring-primary/30 outline-none transition-all"
          />
        </div>

        <div v-if="result" class="rounded-xl px-3 py-2 text-xs" :class="result.success ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'">
          {{ result.message || result.error }}
        </div>
      </div>

      <div class="flex justify-end gap-2 px-5 py-3 border-t border-border/30">
        <button class="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted ios-press transition-colors" @click="$emit('close')">Cancel</button>
        <button
          class="rounded-full px-4 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors disabled:opacity-40 inline-flex items-center gap-1"
          :disabled="!email || sending"
          @click="send"
        >
          <Icon name="lucide:send" class="w-3 h-3" />
          {{ sending ? 'Sending…' : 'Send Test' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ templateId: number }>();
defineEmits<{ close: [] }>();

const { sendTestEmail } = useEmailTemplates();

const email = ref('');
const sending = ref(false);
const result = ref<{ success: boolean; message?: string; error?: string } | null>(null);

async function send() {
  sending.value = true;
  result.value = null;
  try {
    result.value = (await sendTestEmail(props.templateId, email.value)) as any;
  } catch (err: any) {
    result.value = { success: false, error: err.message };
  } finally {
    sending.value = false;
  }
}
</script>
