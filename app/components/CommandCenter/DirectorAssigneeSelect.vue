<!--
  DirectorAssigneeSelect — a compact, dark-themed multi-select for picking who a
  task/ticket goes to inside the Director's Office deck. Deliberately chip-based
  (not a dropdown) so it reads on the boardroom-projector theme and works in
  full-screen. Toggling a teammate emits the full id list up.
-->
<script setup lang="ts">
interface Member { id: string; label: string; avatar?: string | null }

const props = defineProps<{ users: Member[]; modelValue: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [ids: string[]] }>();

function toggle(id: string) {
  const set = new Set(props.modelValue);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  emit('update:modelValue', Array.from(set));
}
function isOn(id: string) { return props.modelValue.includes(id); }
</script>

<template>
  <div class="max-h-40 overflow-y-auto flex flex-wrap gap-1.5 pr-0.5">
    <p v-if="!users.length" class="text-xs text-white/40">No teammates to assign yet.</p>
    <button
      v-for="u in users"
      :key="u.id"
      type="button"
      class="inline-flex items-center gap-1.5 text-xs pl-1 pr-2.5 py-1 rounded-full transition-colors"
      :class="isOn(u.id) ? 'bg-indigo-400/25 ring-1 ring-indigo-300/50 text-white' : 'bg-white/5 ring-1 ring-white/10 text-white/70 hover:text-white hover:ring-white/25'"
      @click="toggle(u.id)"
    >
      <img
        v-if="u.avatar"
        :src="u.avatar"
        :alt="u.label"
        class="w-5 h-5 rounded-full object-cover ring-1 ring-white/15"
      />
      <span v-else class="w-5 h-5 rounded-full bg-white/10 ring-1 ring-white/15 flex items-center justify-center text-[9px] font-semibold uppercase">
        {{ (u.label || '?').slice(0, 1) }}
      </span>
      {{ u.label }}
      <UIcon v-if="isOn(u.id)" name="i-lucide-check" class="w-3 h-3 text-indigo-200" />
    </button>
  </div>
</template>
