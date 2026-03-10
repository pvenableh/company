<template>
  <div>
    <button
      class="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
      @click="isOpen = !isOpen"
    >
      <Icon :name="isOpen ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="w-4 h-4" />
      Merge Tags Reference
    </button>

    <div v-if="isOpen" class="mt-3 border rounded-lg overflow-hidden text-sm">
      <div v-for="group in tagGroups" :key="group.label" class="border-b last:border-0">
        <div class="px-3 py-2 bg-muted/50 font-semibold text-xs text-muted-foreground uppercase tracking-wide">
          {{ group.label }}
        </div>
        <div class="grid grid-cols-2 gap-0">
          <div
            v-for="tag in group.tags"
            :key="tag.key"
            class="flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/20 cursor-pointer border-b border-r last:border-0"
            :title="tag.description || `Copy {{${tag.key}}}`"
            @click="copyTag(tag.key)"
          >
            <code class="text-xs bg-muted px-1.5 py-0.5 rounded text-blue-700 dark:text-blue-400 font-mono">
              {{ '{{' + tag.key + '}}' }}
            </code>
            <span class="text-muted-foreground text-xs truncate">{{ tag.label }}</span>
          </div>
        </div>
      </div>

      <div v-if="customFieldKeys?.length" class="border-t">
        <div class="px-3 py-2 bg-muted/50 font-semibold text-xs text-muted-foreground uppercase tracking-wide">
          Custom Fields
        </div>
        <div class="grid grid-cols-2 gap-0">
          <div
            v-for="key in customFieldKeys"
            :key="key"
            class="flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/20 cursor-pointer"
            @click="copyTag(key)"
          >
            <code class="text-xs bg-muted px-1.5 py-0.5 rounded text-blue-700 dark:text-blue-400 font-mono">
              {{ '{{' + key + '}}' }}
            </code>
          </div>
        </div>
      </div>
    </div>

    <div v-if="copied" class="text-xs text-green-600 mt-1">Copied!</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ customFieldKeys?: string[] }>();

const isOpen = ref(false);
const copied = ref(false);

const tagGroups = [
  {
    label: 'Identity',
    tags: [
      { key: 'first_name', label: 'First Name' },
      { key: 'last_name', label: 'Last Name' },
      { key: 'full_name', label: 'Full Name' },
      { key: 'formal_name', label: 'Formal Name' },
      { key: 'prefix', label: 'Prefix (Mr./Ms./Dr.)' },
      { key: 'email', label: 'Email Address' },
      { key: 'phone', label: 'Phone Number' },
    ],
  },
  {
    label: 'Professional',
    tags: [
      { key: 'job_title', label: 'Job Title' },
      { key: 'company', label: 'Company' },
      { key: 'industry', label: 'Industry' },
      { key: 'website', label: 'Website' },
    ],
  },
  {
    label: 'Location',
    tags: [
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'country', label: 'Country' },
    ],
  },
  {
    label: 'System',
    tags: [
      { key: 'year', label: 'Current Year' },
      { key: 'app_name', label: 'App / Org Name' },
      { key: 'unsubscribe_url', label: 'Unsubscribe Link' },
    ],
  },
];

function copyTag(key: string) {
  navigator.clipboard.writeText(`{{${key}}}`);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}
</script>
