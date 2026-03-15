<script setup lang="ts">
import { toast } from 'vue-sonner';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });

const { initializeOrganizations } = useOrganization();
const router = useRouter();

const orgName = ref('');
const creating = ref(false);

async function handleCreate() {
  if (!orgName.value.trim()) return;

  creating.value = true;
  try {
    await $fetch('/api/org/create', {
      method: 'POST',
      body: { name: orgName.value.trim() },
    });

    toast.success('Organization created!');

    // Refresh org list and redirect
    await initializeOrganizations();
    router.push('/');
  } catch (err: any) {
    toast.error(err?.data?.message || 'Failed to create organization');
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-svh items-center justify-center px-4">
    <div class="w-full max-w-md">
      <div class="ios-card p-8">
        <div class="text-center mb-6">
          <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Icon name="lucide:building-2" class="w-6 h-6 text-primary" />
          </div>
          <h1 class="text-xl font-semibold">Create Organization</h1>
          <p class="text-sm text-muted-foreground mt-1">Set up a new organization to manage your team and projects.</p>
        </div>

        <form @submit.prevent="handleCreate" class="space-y-4">
          <div>
            <label class="text-sm font-medium mb-1.5 block">Organization Name</label>
            <input
              v-model="orgName"
              type="text"
              placeholder="e.g. Acme Corp"
              class="w-full rounded-md border bg-background px-3 py-2 text-sm"
              required
              autofocus
            />
            <p class="text-xs text-muted-foreground mt-1.5">You'll be set as the owner and can invite team members later.</p>
          </div>

          <div class="flex gap-3 pt-2">
            <Button type="button" variant="outline" class="flex-1" @click="router.back()">
              Cancel
            </Button>
            <Button type="submit" class="flex-1" :disabled="!orgName.trim() || creating">
              <Icon v-if="creating" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
              {{ creating ? 'Creating...' : 'Create Organization' }}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
