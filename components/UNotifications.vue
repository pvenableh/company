<script setup lang="ts">
/**
 * UNotifications - NuxtUI-compatible notifications wrapper for vue-sonner Toaster
 */

import { Toaster } from "vue-sonner";
</script>

<template>
  <Toaster
    position="top-right"
    :toastOptions="{
      classNames: {
        toast: 'group toast bg-background text-foreground border-border shadow-lg',
        title: 'text-foreground',
        description: 'text-muted-foreground',
        actionButton: 'bg-primary text-primary-foreground',
        cancelButton: 'bg-muted text-muted-foreground',
        closeButton: 'bg-background text-foreground border-border',
        success: 'border-green-500/50 bg-green-50 dark:bg-green-900/20',
        error: 'border-red-500/50 bg-red-50 dark:bg-red-900/20',
        warning: 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/20',
        info: 'border-blue-500/50 bg-blue-50 dark:bg-blue-900/20',
      },
    }"
    rich-colors
    close-button
  />
</template>
