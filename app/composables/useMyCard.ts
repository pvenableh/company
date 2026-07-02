/**
 * useMyCard — the current user's business card + booking, loaded once and shared,
 * with optimistic debounced autosave. Bind v-model straight to `data.card.*` /
 * `data.booking.*` and call `touch()` on input; the PATCH is coalesced (~700ms)
 * and the row is the SAME one CardDesk + the public /c/[id] card read.
 */
import { useDebounceFn } from '@vueuse/core';

export interface MyCard {
  card: Record<string, any>;
  booking: {
    public_booking_enabled: boolean;
    // Coerced to '' (never null) on load so they bind cleanly to text inputs.
    booking_page_slug: string;
    booking_page_title: string;
    booking_page_description: string;
  };
  publicCardUrl: string;
  bookingPath: string | null;
  assetsUrl: string;
}

export function useMyCard() {
  const data = useState<MyCard | null>('my-card', () => null);
  const loading = useState<boolean>('my-card-loading', () => false);
  const saving = useState<boolean>('my-card-saving', () => false);
  const savedAt = useState<number>('my-card-saved-at', () => 0);
  const error = useState<string | null>('my-card-error', () => null);

  async function load(force = false) {
    if (data.value && !force) return;
    loading.value = true;
    error.value = null;
    try {
      const res = await $fetch<MyCard>('/api/me/card');
      // Null → '' so booking text fields bind directly to inputs.
      const b = res.booking as any;
      b.booking_page_slug ??= '';
      b.booking_page_title ??= '';
      b.booking_page_description ??= '';
      data.value = res;
    } catch (e: any) {
      error.value = e?.data?.message || 'Could not load your card';
    } finally {
      loading.value = false;
    }
  }

  async function flush() {
    if (!data.value) return;
    saving.value = true;
    try {
      const res = await $fetch<MyCard>('/api/me/card', {
        method: 'PATCH',
        body: { card: data.value.card, booking: data.value.booking },
      });
      // Reconcile server-derived bits (urls/booking path) without clobbering the
      // card fields the user may still be editing.
      data.value.publicCardUrl = res.publicCardUrl;
      data.value.bookingPath = res.bookingPath;
      savedAt.value = Date.now();
    } catch (e: any) {
      error.value = e?.data?.message || 'Save failed';
    } finally {
      saving.value = false;
    }
  }

  const debouncedSave = useDebounceFn(flush, 700);
  /** Call after any field edit — coalesces into one PATCH. */
  function touch() {
    debouncedSave();
  }

  // Sheet open/close (the editor is mounted once globally in app.vue).
  const isOpen = useState<boolean>('my-card-open', () => false);
  function open() {
    isOpen.value = true;
    load();
  }
  async function close() {
    await flush(); // make sure a pending debounced edit lands before closing
    isOpen.value = false;
  }

  return { data, loading, saving, savedAt, error, isOpen, load, touch, flush, open, close };
}
