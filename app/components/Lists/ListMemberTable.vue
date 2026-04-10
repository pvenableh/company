<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b text-left text-muted-foreground">
          <th class="pb-3 pr-4 font-medium">Name</th>
          <th class="pb-3 pr-4 font-medium">Email</th>
          <th class="pb-3 pr-4 font-medium">Company</th>
          <th class="pb-3 pr-4 font-medium">Status</th>
          <th class="pb-3 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="contact in contacts"
          :key="contact.id"
          class="border-b last:border-0 hover:bg-muted/50"
        >
          <td class="py-3 pr-4 font-medium">
            {{ contact.first_name }} {{ contact.last_name }}
          </td>
          <td class="py-3 pr-4 text-muted-foreground">{{ contact.email }}</td>
          <td class="py-3 pr-4 text-muted-foreground">{{ contact.company || '—' }}</td>
          <td class="py-3 pr-4">
            <ContactStatusBadge :status="contact.status" />
          </td>
          <td class="py-3 text-right">
            <Button
              variant="ghost"
              size="sm"
              class="text-destructive"
              @click="$emit('remove', contact)"
            >
              Remove
            </Button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!contacts.length" class="text-center py-8 text-muted-foreground">
      No members in this list yet.
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Contact } from '~~/shared/email/contacts';
import { Button } from '~/components/ui/button';

defineProps<{ contacts: Contact[] }>();
defineEmits<{ remove: [contact: Contact] }>();
</script>
