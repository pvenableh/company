import { vi } from 'vitest';
import { computed, ref, readonly } from 'vue';

// Provide Nuxt auto-imports as globals so Vue SFCs work in tests
vi.stubGlobal('computed', computed);
vi.stubGlobal('ref', ref);
vi.stubGlobal('readonly', readonly);
vi.stubGlobal('useState', (_key: string, init: () => any) => ref(init()));
vi.stubGlobal('useHaptic', () => ({ triggerHaptic: vi.fn() }));
