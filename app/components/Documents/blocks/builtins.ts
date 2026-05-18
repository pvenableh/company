/**
 * Register the built-in document block types with the shared registry.
 *
 * Imported once (side-effect) from BlockComposer + BlockRenderer so any
 * client surface that mounts either component has the registry ready.
 *
 * As more primitives ship, add a registerBlockType call here.
 */
import { registerBlockType } from '~~/shared/blocks/registry';
import type { RichTextPayload } from '~~/shared/blocks/types';

let registered = false;

export function ensureBuiltinsRegistered() {
	if (registered) return;
	registered = true;

	registerBlockType<RichTextPayload>({
		type: 'rich_text',
		name: 'Rich text',
		icon: 'lucide:text',
		appliesTo: ['proposals', 'contracts'],
		description: 'Heading + markdown body. The default block.',
		defaultPayload: () => ({ heading: '', body_markdown: '' }),
		Editor: () => import('./RichTextEditor.vue').then((m) => m.default),
		Renderer: () => import('./RichTextRenderer.vue').then((m) => m.default),
	});
}

// Auto-register on module import — the consumer just needs to import this file.
ensureBuiltinsRegistered();
