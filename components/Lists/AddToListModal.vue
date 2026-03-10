<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="$emit('close')">
    <div class="bg-background rounded-lg shadow-lg w-full max-w-md mx-4">
      <div class="flex items-center justify-between px-5 py-4 border-b">
        <h3 class="font-semibold text-sm">Add to Mailing List</h3>
        <button class="text-muted-foreground hover:text-foreground" @click="$emit('close')">
          <Icon name="lucide:x" class="w-4 h-4" />
        </button>
      </div>

      <div class="px-5 py-4 space-y-3">
        <p class="text-sm text-muted-foreground">
          Select a list to add {{ contactName }} to:
        </p>

        <div class="space-y-2 max-h-64 overflow-y-auto">
          <label
            v-for="list in lists"
            :key="list.id"
            class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
            :class="selectedListId === list.id ? 'border-primary bg-primary/5' : ''"
          >
            <input
              type="radio"
              :value="list.id"
              v-model="selectedListId"
              class="accent-primary"
            />
            <div>
              <p class="text-sm font-medium">{{ list.name }}</p>
              <p class="text-xs text-muted-foreground">
                {{ list.subscriber_count || 0 }} subscribers
              </p>
            </div>
          </label>
        </div>
      </div>

      <div class="flex justify-end gap-2 px-5 py-3 border-t">
        <Button variant="outline" @click="$emit('close')">Cancel</Button>
        <Button :disabled="!selectedListId || adding" @click="handleAdd">
          {{ adding ? 'Adding...' : 'Add to List' }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MailingList } from '~/types/email/contacts';
import { Button } from '~/components/ui/button';

const props = defineProps<{
  contactId: number;
  contactName: string;
  lists: MailingList[];
}>();

const emit = defineEmits<{
  close: [];
  added: [listId: number];
}>();

const selectedListId = ref<number | null>(null);
const adding = ref(false);

const { addToList } = useContacts();

async function handleAdd() {
  if (!selectedListId.value) return;
  adding.value = true;
  try {
    await addToList(props.contactId, selectedListId.value);
    emit('added', selectedListId.value);
    emit('close');
  } finally {
    adding.value = false;
  }
}
</script>
