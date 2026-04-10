<template>
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b text-left text-muted-foreground">
          <th class="pb-3 pr-4 font-medium">Name</th>
          <th class="pb-3 pr-4 font-medium">Email</th>
          <th class="pb-3 pr-4 font-medium">Company</th>
          <th class="pb-3 pr-4 font-medium">Status</th>
          <th class="pb-3 pr-4 font-medium">Tags</th>
          <th class="pb-3 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody v-if="!loading">
        <tr
          v-for="contact in contacts"
          :key="contact.id"
          class="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
          @click="$emit('edit', contact)"
        >
          <td class="py-3 pr-4">
            <div>
              <span class="font-medium">
                {{ contact.prefix ? `${contact.prefix} ` : '' }}{{ contact.first_name }} {{ contact.last_name }}
              </span>
              <span v-if="contact.title" class="block text-xs text-muted-foreground">
                {{ contact.title }}
              </span>
            </div>
          </td>
          <td class="py-3 pr-4 text-muted-foreground">{{ contact.email }}</td>
          <td class="py-3 pr-4 text-muted-foreground">{{ contact.company || '—' }}</td>
          <td class="py-3 pr-4">
            <ContactStatusBadge :status="contact.status" />
          </td>
          <td class="py-3 pr-4">
            <div class="flex gap-1 flex-wrap">
              <ContactTagBadge v-for="tag in (contact.tags || []).slice(0, 3)" :key="tag" :tag="tag" />
              <span v-if="(contact.tags || []).length > 3" class="text-xs text-muted-foreground">
                +{{ contact.tags!.length - 3 }}
              </span>
            </div>
          </td>
          <td class="py-3 text-right">
            <div class="flex items-center justify-end gap-1" @click.stop>
              <Button
                v-if="contact.email_subscribed"
                variant="ghost"
                size="icon-sm"
                title="Unsubscribe"
                @click="$emit('unsubscribe', contact)"
              >
                <Icon name="lucide:mail-minus" class="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Delete"
                @click="$emit('delete', contact)"
              >
                <Icon name="lucide:trash-2" class="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </td>
        </tr>
      </tbody>
      <tbody v-else>
        <tr v-for="i in 5" :key="i">
          <td colspan="6" class="py-3">
            <div class="h-4 bg-muted rounded animate-pulse" />
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!loading && !contacts.length" class="text-center py-12 text-muted-foreground">
      No contacts found.
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Contact } from '~~/shared/email/contacts';
import { Button } from '~/components/ui/button';

defineProps<{
  contacts: Contact[];
  loading?: boolean;
}>();

defineEmits<{
  edit: [contact: Contact];
  unsubscribe: [contact: Contact];
  delete: [contact: Contact];
}>();
</script>
