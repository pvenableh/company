<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="$emit('close')">
    <div class="bg-background rounded-lg shadow-lg w-full max-w-md mx-4">
      <div class="flex items-center justify-between px-5 py-4 border-b">
        <h3 class="font-semibold text-sm">Send Test Email</h3>
        <button class="text-muted-foreground hover:text-foreground" @click="$emit('close')">
          <Icon name="lucide:x" class="w-4 h-4" />
        </button>
      </div>

      <div class="px-5 py-4 space-y-4">
        <div class="space-y-1.5">
          <label class="text-xs font-medium">Recipient Email</label>
          <input
            v-model="email"
            type="email"
            placeholder="test@example.com"
            class="w-full rounded-md border px-3 py-2 text-sm bg-background"
          />
        </div>

        <div v-if="result" class="rounded-md px-3 py-2 text-sm" :class="result.success ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-destructive/10 text-destructive'">
          {{ result.message || result.error }}
        </div>
      </div>

      <div class="flex justify-end gap-2 px-5 py-3 border-t">
        <Button variant="outline" size="sm" @click="$emit('close')">Cancel</Button>
        <Button size="sm" :disabled="!email || sending" @click="send">
          {{ sending ? 'Sending…' : 'Send Test' }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';

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
