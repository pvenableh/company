<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3 mb-6">
      <div class="w-10 h-10 rounded-full flex items-center justify-center" :class="result.errors?.length ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-green-100 dark:bg-green-900/30'">
        <Icon
          :name="result.errors?.length ? 'lucide:alert-triangle' : 'lucide:check'"
          :class="result.errors?.length ? 'text-amber-600 w-5 h-5' : 'text-green-600 w-5 h-5'"
        />
      </div>
      <div>
        <h3 class="font-semibold">Import Complete</h3>
        <p class="text-sm text-muted-foreground">
          Processed {{ result.total }} rows
        </p>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div class="p-4 border rounded-lg text-center">
        <p class="text-2xl font-bold text-green-600">{{ result.created }}</p>
        <p class="text-xs text-muted-foreground mt-1">Created</p>
      </div>
      <div class="p-4 border rounded-lg text-center">
        <p class="text-2xl font-bold text-blue-600">{{ result.updated }}</p>
        <p class="text-xs text-muted-foreground mt-1">Updated</p>
      </div>
      <div class="p-4 border rounded-lg text-center">
        <p class="text-2xl font-bold text-gray-500">{{ result.skipped }}</p>
        <p class="text-xs text-muted-foreground mt-1">Skipped</p>
      </div>
    </div>

    <div v-if="result.errors?.length" class="mt-4">
      <h4 class="font-medium text-sm text-destructive mb-2">
        Errors ({{ result.errors.length }})
      </h4>
      <div class="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
        <div
          v-for="(error, i) in result.errors"
          :key="i"
          class="px-3 py-2 text-xs border-b last:border-0 bg-destructive/5"
        >
          <span class="font-mono text-muted-foreground">Row {{ error.row }}</span>
          <span v-if="error.email" class="mx-1">{{ error.email }}</span>
          <span class="text-destructive">{{ error.reason }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CsvImportResult } from '~/types/email/contacts';

defineProps<{ result: CsvImportResult }>();
</script>
