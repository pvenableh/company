# Apps slide-over panels

Every panel rendered by `<AppsAppSlideOverStack>` lives here.

The stack reads the global slide-over state (managed by
`useAppSlideOverStack` in `app/composables/useAppSlideOverStack.ts`),
looks each entry up in `registry.ts` by type string, and renders the
matching component with iOS-style push/pop visuals (Framework7 spec,
spring curve `cubic-bezier(0.36, 0.66, 0.04, 1)` at 400ms, behind panel
slides -20% + scales 0.96 + dims to 0.6, shared backdrop deepens).

## Adding a new panel (≤4 file edits)

1. Create `<Entity>Panel.vue` in this directory:

   ```vue
   <script setup lang="ts">
   import AppSlideOverShell from '../AppSlideOverShell.vue';

   const props = defineProps<{ id: string }>();
   defineEmits<{ (e: 'close'): void }>();

   const entity = ref<any | null>(null);

   watch(
     () => props.id,
     async (id) => {
       if (!id) return;
       entity.value = await /* fetch by id */;
     },
     { immediate: true },
   );
   </script>

   <template>
     <AppSlideOverShell :title="entity?.title || 'Entity'" @close="$emit('close')">
       <!-- body content -->
     </AppSlideOverShell>
   </template>
   ```

2. Add an entry in `registry.ts`:

   ```ts
   const REGISTRY: Record<string, PanelLoader> = {
     // ...existing entries
     invoice: () => import('./InvoicePanel.vue'),
   };
   ```

3. Wire the open trigger in the page that lists this entity:

   ```ts
   const invoiceSlide = useAppSlideOver('invoice');
   function openInvoice(id: string) { invoiceSlide.open(id); }
   ```

4. (Optional) Add a thin route wrapper at `/apps/invoices/[id]` if you
   want direct URL access to deep-link to the same panel content.

## Cross-panel push

Inside a panel, open another panel via `useAppSlideOverStack().push()`:

```ts
const { push } = useAppSlideOverStack();
push('contact', contactId);   // stacks on top, behind panel slides + dims
```

Max depth is 2 — pushing onto a full stack replaces the top, keeping
the underlying page context (e.g. clients/[id]) intact.

## Conventions

- **Always wrap in `<AppSlideOverShell>`.** The shell renders the header
  chrome (X close at depth 1, back chevron at depth ≥ 2) + scrollable
  body + optional footer slot. Don't roll your own header — it breaks
  the stack's a11y guarantees (focus trap, aria-modal, scroll lock).

- **Fetch by id, don't borrow from the page.** The page that triggered
  the panel may not be mounted (deep-link, reload, cross-page push).
  Each panel fetches its own data in a `watch(() => props.id, …, { immediate: true })`.

- **Don't put viewport-positioned modals inside a panel body.** Panels
  live inside a `transform`-ed container, which breaks `position:
  fixed` for descendants. Push heavy modals up to the page wrapper.

- **Emit a refresh signal, don't reach into the page.** If a panel
  saves changes that list pages should reflect, bump a shared
  `useState<number>('<entity>-refresh', () => 0)` counter. List pages
  watch the counter and refetch.

## Files in this directory

| File | Purpose |
| ---- | ------- |
| `registry.ts` | type → async component map (single edit point for adding panels) |
| `ContactPanel.vue` | Read-only contact details |
| `ProjectDetailPanel.vue` | Quick-look project card |
| `MeetingPanel.vue` | Meeting summary + recording link |
| `CampaignPanel.vue` | Editable status / goal / dates for marketing campaigns |
| `ClientDetailPanel.vue` | Lean client surface with embedded contacts list (validates cross-panel push) |
