<!--
  EarnestDraftButton — the shared inline "Draft with Earnest" affordance.

  A small pill trigger that opens a brief popover (free-text prompt) and emits
  the brief to the parent, which owns the actual generation + how the result is
  applied to its field(s). Optional + non-blocking — it never edits the field
  itself, so it drops onto any content/caption/text surface.

  Loading is parent-controlled (`:loading`) because the generation round-trip
  lives with the field it fills. Copy stays plain per the Earnest voice charter
  — no unearned hype.

  Props:
    :loading      boolean   parent is generating — shows a spinner, blocks submit
    :label        string    trigger label (default "Draft with Earnest")
    :placeholder  string    brief textarea placeholder
    :disabled     boolean   disable the trigger entirely

  Emits:
    submit  (brief: string)  the user's brief, once they hit Draft
-->
<script setup lang="ts">
const props = defineProps<{
  loading?: boolean;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  /** 'pill' (default) is the standalone chip; 'link' is a small inline text link. */
  variant?: 'pill' | 'link';
  /** Allow generating with no brief — one-click "suggest from context". */
  allowEmpty?: boolean;
}>();

const emit = defineEmits<{
  (e: 'submit', brief: string): void;
}>();

const open = ref(false);
const brief = ref('');
const inputEl = ref<HTMLTextAreaElement | null>(null);

function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) {
    nextTick(() => inputEl.value?.focus());
  }
}

function submit() {
  const value = brief.value.trim();
  if ((!value && !props.allowEmpty) || props.loading) return;
  emit('submit', value);
  open.value = false;
}

function close() {
  open.value = false;
}
</script>

<template>
  <div class="relative inline-flex">
    <button
      v-if="variant === 'link'"
      type="button"
      class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
      :disabled="disabled"
      @click="toggle"
    >
      <UIcon v-if="loading" name="i-lucide-loader-2" class="w-3 h-3 animate-spin" />
      <EarnestIcon v-else class="w-3 h-3" />
      {{ loading ? 'Suggesting…' : (label || 'Earnest Suggest') }}
    </button>
    <button
      v-else
      type="button"
      class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/15 transition-colors disabled:opacity-50"
      :disabled="disabled"
      @click="toggle"
    >
      <UIcon v-if="loading" name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />
      <EarnestIcon v-else class="w-3.5 h-3.5" />
      {{ loading ? 'Drafting…' : (label || 'Draft with Earnest') }}
    </button>

    <!-- Popover: click-away backdrop + panel. Kept dependency-free (no Reka
         trigger) to sidestep the double-toggle gotcha. -->
    <template v-if="open">
      <div class="fixed inset-0 z-40" @click="close" />
      <div
        class="absolute z-50 top-full left-0 mt-2 w-80 max-w-[85vw] rounded-2xl border border-border bg-card shadow-xl p-3 space-y-2"
        @click.stop
      >
        <div class="flex items-center gap-1.5 text-xs font-medium text-primary">
          <EarnestIcon class="w-3.5 h-3.5" />
          {{ label || 'Draft with Earnest' }}
        </div>
        <textarea
          ref="inputEl"
          v-model="brief"
          :rows="3"
          :placeholder="placeholder || 'What is this post about? A sentence or two is plenty.'"
          class="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          @keydown.meta.enter="submit"
          @keydown.ctrl.enter="submit"
        />
        <p v-if="allowEmpty" class="text-[10px] text-muted-foreground">Optional — leave blank to let Earnest suggest from what it knows.</p>
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
            @click="close"
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            :disabled="(!brief.trim() && !allowEmpty) || loading"
            @click="submit"
          >
            <UIcon v-if="loading" name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />
            <UIcon v-else name="i-lucide-sparkles" class="w-3.5 h-3.5" />
            {{ variant === 'link' ? 'Suggest' : 'Draft' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
