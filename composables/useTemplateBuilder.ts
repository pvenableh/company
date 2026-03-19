import { nanoid } from 'nanoid';
import type {
  CanvasBlock,
  EmailPartial,
  NewsletterBlock,
  TemplateBlockWithBlock,
} from '~/types/email/blocks';
import { parseVariablesSchema } from '~/types/email/blocks';

export function useTemplateBuilder(templateId: Ref<number>) {
  const { previewNewsletter } = useEmailTemplates();
  const { getDefaultPartial, getOrgPartial, getPartial, getAvailablePartials, updatePartial } = useEmailPartials();
  const { selectedOrg } = useOrganization();
  const templateBlockItems = useDirectusItems('template_blocks');
  const emailTemplateItems = useDirectusItems('email_templates');

  const canvas = ref<CanvasBlock[]>([]);
  const previewHtml = ref('');
  const previewErrors = ref<string[]>([]);
  const isDirty = ref(false);
  const saving = ref(false);

  // Partial toggles
  const includeHeader = ref(true);
  const includeFooter = ref(true);
  const includeWebVersionBar = ref(true);
  const headerPartial = ref<EmailPartial | null>(null);
  const footerPartial = ref<EmailPartial | null>(null);
  const webVersionBarPartial = ref<EmailPartial | null>(null);

  // ── Load existing template blocks + partial settings ───────────────
  const loadBlocks = async () => {
    const blocks = await templateBlockItems.list({
      fields: ['*', 'block_id.*'],
      filter: { template_id: { _eq: templateId.value } },
      sort: ['sort'],
    }) as unknown as TemplateBlockWithBlock[];

    canvas.value = (blocks || []).map((tb, i) => ({
      instanceId: nanoid(8),
      blockId: tb.block_id.id,
      block: tb.block_id,
      variables: mergeWithSchemaDefaults(tb.instance_variables || {}, tb.block_id),
      sort: i,
    }));

    // Load template partial settings
    const tmpl = await emailTemplateItems.get(templateId.value, {
      fields: ['include_header', 'include_footer', 'include_web_version_bar', 'header_partial_id', 'footer_partial_id'],
    }) as any;

    includeHeader.value = tmpl.include_header !== false;
    includeFooter.value = tmpl.include_footer !== false;
    includeWebVersionBar.value = tmpl.include_web_version_bar !== false;

    // Load partials (from template or defaults)
    await loadPartials(tmpl.header_partial_id, tmpl.footer_partial_id);
  };

  const loadPartials = async (headerId?: number | null, footerId?: number | null) => {
    const orgId = selectedOrg.value || null;
    const [header, footer, webBar] = await Promise.all([
      headerId ? getPartial(headerId) : getOrgPartial('header', orgId),
      footerId ? getPartial(footerId) : getOrgPartial('footer', orgId),
      getOrgPartial('web_version_bar', orgId),
    ]);
    headerPartial.value = header;
    footerPartial.value = footer;
    webVersionBarPartial.value = webBar;
  };

  /** Get available partials for a type (org-specific + system defaults). */
  const getPartialOptions = async (type: 'header' | 'footer' | 'web_version_bar') => {
    const orgId = selectedOrg.value || null;
    return getAvailablePartials(type, orgId);
  };

  /** Update the variables for the current header or footer partial and save to Directus. */
  const updatePartialVariables = async (
    type: 'header' | 'footer' | 'web_version_bar',
    vars: Record<string, any>,
  ) => {
    const partial =
      type === 'header' ? headerPartial.value
      : type === 'footer' ? footerPartial.value
      : webVersionBarPartial.value;
    if (!partial) return;

    // Update in Directus
    await updatePartial(partial.id, { instance_variables: vars });
    // Update locally
    partial.instance_variables = vars;
    isDirty.value = true;
  };

  // ── Canvas operations ──────────────────────────────────────────────
  const addBlock = (block: NewsletterBlock, atIndex?: number) => {
    const newBlock: CanvasBlock = {
      instanceId: nanoid(8),
      blockId: block.id,
      block,
      variables: getDefaultVariables(block),
      sort: canvas.value.length,
    };
    if (atIndex !== undefined) {
      canvas.value.splice(atIndex, 0, newBlock);
    } else {
      canvas.value.push(newBlock);
    }
    reindex();
    isDirty.value = true;
  };

  const removeBlock = (instanceId: string) => {
    canvas.value = canvas.value.filter((b) => b.instanceId !== instanceId);
    reindex();
    isDirty.value = true;
  };

  const moveBlock = (instanceId: string, direction: 'up' | 'down') => {
    const idx = canvas.value.findIndex((b) => b.instanceId === instanceId);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= canvas.value.length) return;
    // Create a new array to trigger watchers in BuilderCanvas
    const arr = [...canvas.value];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    arr.forEach((b, i) => (b.sort = i));
    canvas.value = arr;
    isDirty.value = true;
  };

  const updateBlockVariables = (instanceId: string, vars: Record<string, any>) => {
    const block = canvas.value.find((b) => b.instanceId === instanceId);
    if (block) {
      block.variables = { ...block.variables, ...vars };
      isDirty.value = true;
    }
  };

  const reindex = () => {
    canvas.value.forEach((b, i) => (b.sort = i));
  };

  // ── MJML Assembly ──────────────────────────────────────────────────

  /**
   * Get a safe fallback value for an MJML variable based on its schema type.
   * Prevents empty strings from producing invalid MJML attributes like
   * background-color="" or width="".
   */
  function resolveVariableValue(value: any, type?: string, key?: string): string {
    const str = String(value ?? '');
    if (str.trim() === '') {
      // Type-aware fallbacks for empty values
      switch (type) {
        case 'color': {
          // Use sensible defaults: text/font colors default to dark, backgrounds to transparent
          const lowerKey = (key || '').toLowerCase();
          if (lowerKey.includes('background') || lowerKey.includes('bg')) return 'transparent';
          if (lowerKey.includes('text') || lowerKey.includes('font') || lowerKey.includes('color')) return '#333333';
          return '#333333'; // Default to visible dark color
        }
        case 'boolean': return 'false';
        default: return '';
      }
    }
    // Safety net: validate color values even when non-empty — prevents text leaking into color attrs
    if (type === 'color') {
      const colorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
      if (!colorRegex.test(str) && !['transparent', 'inherit', 'currentColor'].includes(str)) {
        return '#333333';
      }
    }
    return str;
  }

  const resolvePartialMjml = (partial: EmailPartial | null): string => {
    if (!partial) return '';
    let source = partial.mjml_source;
    const vars = partial.instance_variables || {};
    // Replace design-time variables with type-aware defaults
    const schema = parseVariablesSchema(partial.variables_schema, partial.mjml_source);
    if (schema.length) {
      for (const def of schema) {
        const raw = vars[def.key] ?? def.default ?? '';
        const value = resolveVariableValue(raw, def.type, def.key);
        source = source.replaceAll(`{{{${def.key}}}}`, value);
      }
    }
    return source;
  };

  /**
   * Remove MJML attributes with empty, whitespace-only, or unreplaced
   * template variable values — all of which cause MJML validation errors
   * (invalid Color, Unit, or Enum values).
   */
  const stripEmptyMjmlAttributes = (mjml: string): string => {
    let result = mjml;
    // Strip attributes with empty values: attr=""
    result = result.replace(/\s+[\w-]+=""/g, '');
    // Strip attributes with whitespace-only values: attr="   "
    result = result.replace(/\s+[\w-]+="\s+"/g, '');
    // Strip attributes with unreplaced design-time variables: attr="{{{...}}}"
    result = result.replace(/\s+[\w-]+="\{\{\{[^}]*\}\}\}"/g, '');
    return result;
  };

  const assembleMjml = (): string => {
    const sections: string[] = [];

    // Web version bar (always first if enabled)
    if (includeWebVersionBar.value && webVersionBarPartial.value) {
      sections.push(resolvePartialMjml(webVersionBarPartial.value));
    }

    // Header partial
    if (includeHeader.value && headerPartial.value) {
      sections.push(resolvePartialMjml(headerPartial.value));
    }

    // Canvas blocks — use schema-aware substitution
    for (const cb of canvas.value) {
      let source = cb.block.mjml_source;
      const schema = parseVariablesSchema(cb.block.variables_schema, cb.block.mjml_source);
      for (const [key, value] of Object.entries(cb.variables)) {
        const def = schema.find((s) => s.key === key);
        const resolved = resolveVariableValue(value, def?.type, key);
        source = source.replaceAll(`{{{${key}}}}`, resolved);
      }
      sections.push(source);
    }

    // Footer partial
    if (includeFooter.value && footerPartial.value) {
      sections.push(resolvePartialMjml(footerPartial.value));
    }

    // Strip empty attributes before returning to prevent MJML validation errors
    const raw = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Arial, Helvetica, sans-serif" />
      <mj-text font-size="15px" color="#333333" line-height="1.7" />
      <mj-section padding="0" />
    </mj-attributes>
    <mj-style>
      .link-nostyle { color: inherit; text-decoration: none; }
      a { color: #000000; }
    </mj-style>
  </mj-head>
  <mj-body background-color="#f4f4f4">
${sections.join('\n')}
  </mj-body>
</mjml>`;
    return stripEmptyMjmlAttributes(raw);
  };

  // ── Preview ────────────────────────────────────────────────────────
  const refreshPreview = async () => {
    try {
      const mjml = assembleMjml();
      const result = await previewNewsletter(mjml, {
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        year: new Date().getFullYear(),
        app_name: 'Your Organization',
        unsubscribe_url: '#unsubscribe',
      });
      previewHtml.value = result.html;
      previewErrors.value = result.errors;
    } catch (err: any) {
      console.error('[TemplateBuilder] Preview failed:', err);
      previewHtml.value = '';
      previewErrors.value = [err.message || 'Failed to compile MJML preview'];
    }
  };

  // ── Save ───────────────────────────────────────────────────────────
  const save = async () => {
    saving.value = true;
    try {
      const assembledMjml = assembleMjml();

      // 1. Get existing template_blocks to delete
      const existing = await templateBlockItems.list({
        fields: ['id'],
        filter: { template_id: { _eq: templateId.value } },
        limit: -1,
      });

      // 2. Delete existing template_blocks
      if (existing.length > 0) {
        const ids = existing.map((tb: any) => tb.id);
        await templateBlockItems.remove(ids);
      }

      // 3. Insert new template_blocks in order
      for (let i = 0; i < canvas.value.length; i++) {
        const cb = canvas.value[i];
        await templateBlockItems.create({
          template_id: templateId.value,
          block_id: cb.blockId,
          sort: i,
          instance_variables:
            Object.keys(cb.variables).length > 0 ? cb.variables : null,
        });
      }

      // 4. Update email_template with compiled MJML + partial settings
      await emailTemplateItems.update(templateId.value, {
        mjml_source: assembledMjml,
        mjml_assembled_at: new Date().toISOString(),
        block_count: canvas.value.length,
        include_header: includeHeader.value,
        include_footer: includeFooter.value,
        include_web_version_bar: includeWebVersionBar.value,
        header_partial_id: headerPartial.value?.id || null,
        footer_partial_id: footerPartial.value?.id || null,
      });

      isDirty.value = false;
    } finally {
      saving.value = false;
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────

  /** Return a safe default value for a variable type (prevents empty MJML attrs). */
  function getTypeDefault(type: string, key?: string): any {
    switch (type) {
      case 'color': {
        const lowerKey = (key || '').toLowerCase();
        if (lowerKey.includes('background') || lowerKey.includes('bg')) return 'transparent';
        return '#333333';
      }
      case 'boolean': return false;
      default: return '';
    }
  }

  function getDefaultVariables(block: NewsletterBlock): Record<string, any> {
    const schema = parseVariablesSchema(block.variables_schema, block.mjml_source);
    if (!schema.length) return {};
    return Object.fromEntries(
      schema.map((v) => [v.key, v.default ?? getTypeDefault(v.type, v.key)])
    );
  }

  /**
   * Merge saved instance variables with schema defaults.
   * Ensures variables added after a block was saved still get safe defaults,
   * and empty/null saved values fall back to type-aware defaults.
   */
  function mergeWithSchemaDefaults(
    saved: Record<string, any>,
    block: NewsletterBlock,
  ): Record<string, any> {
    const schema = parseVariablesSchema(block.variables_schema, block.mjml_source);
    if (!schema.length) return saved;

    const result: Record<string, any> = {};
    // Apply schema-aware defaults, then overlay saved values
    for (const def of schema) {
      const savedVal = saved[def.key];
      if (savedVal !== undefined && savedVal !== null && savedVal !== '') {
        result[def.key] = savedVal;
      } else {
        result[def.key] = def.default ?? getTypeDefault(def.type, def.key);
      }
    }
    // Preserve any extra saved variables not in current schema
    for (const [key, val] of Object.entries(saved)) {
      if (!(key in result)) {
        result[key] = val;
      }
    }
    return result;
  }

  const togglePartial = (type: 'header' | 'footer' | 'web_version_bar', value: boolean) => {
    if (type === 'header') includeHeader.value = value;
    else if (type === 'footer') includeFooter.value = value;
    else includeWebVersionBar.value = value;
    isDirty.value = true;
  };

  // ── AI Populate ─────────────────────────────────────────────────────
  /**
   * Populate the canvas from AI-generated sections.
   * Matches each section to a real block from the library, then fills its variables.
   */
  const populateFromAI = (
    sections: Array<{ blockCategory: string; blockName: string; variables: Record<string, any> }>,
    blockLibrary: Record<string, NewsletterBlock[]>,
  ) => {
    // Flatten library into a single array for matching
    const allBlocks = Object.values(blockLibrary).flat();

    const newCanvas: CanvasBlock[] = [];

    for (const section of sections) {
      // Try exact name + category match first, then name-only, then category fallback
      const block =
        allBlocks.find(
          (b) => b.name?.toLowerCase() === section.blockName?.toLowerCase()
            && b.category === section.blockCategory,
        )
        || allBlocks.find(
          (b) => b.name?.toLowerCase() === section.blockName?.toLowerCase(),
        )
        || allBlocks.find(
          (b) => b.category === section.blockCategory,
        );

      if (!block) continue;

      // Get schema defaults, then overlay AI-generated content
      const defaults = getDefaultVariables(block);
      const variables = { ...defaults };

      // Map AI variables to block schema keys, validating types
      const colorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
      const schema = parseVariablesSchema(block.variables_schema, block.mjml_source);

      // Helper to validate and assign a value based on field type
      const assignValidated = (targetKey: string, schemaDef: { type: string; default?: string }, val: any) => {
        if (typeof val !== 'string') { variables[targetKey] = val; return; }
        if (schemaDef.type === 'color') {
          // Color field must get a valid hex — reject text content
          variables[targetKey] = colorRegex.test(val) ? val : (schemaDef.default || '#333333');
        } else if (schemaDef.type === 'text' || schemaDef.type === 'richtext') {
          // Text field must NOT get a bare hex color — keep the default instead
          variables[targetKey] = colorRegex.test(val) ? (schemaDef.default || '') : val;
        } else {
          variables[targetKey] = val;
        }
      };

      for (const [key, value] of Object.entries(section.variables)) {
        // Direct key match
        const schemaDef = schema.find((s) => s.key === key);
        if (schemaDef) {
          assignValidated(key, schemaDef, value);
        } else {
          // Try fuzzy matching (AI might use slightly different key names)
          const lowerKey = key.toLowerCase();
          const match = schema.find((s) =>
            s.key.toLowerCase() === lowerKey
            || s.key.toLowerCase().includes(lowerKey)
            || lowerKey.includes(s.key.toLowerCase()),
          );
          if (match) {
            assignValidated(match.key, match, value);
          }
        }
      }

      newCanvas.push({
        instanceId: nanoid(8),
        blockId: block.id,
        block,
        variables,
        sort: newCanvas.length,
      });
    }

    if (newCanvas.length > 0) {
      canvas.value = newCanvas;
      isDirty.value = true;
    }
  };

  return {
    canvas,
    previewHtml,
    previewErrors,
    isDirty,
    saving,
    includeHeader,
    includeFooter,
    includeWebVersionBar,
    headerPartial,
    footerPartial,
    webVersionBarPartial,
    loadBlocks,
    addBlock,
    removeBlock,
    moveBlock,
    updateBlockVariables,
    togglePartial,
    getPartialOptions,
    updatePartialVariables,
    populateFromAI,
    assembleMjml,
    refreshPreview,
    save,
  };
}
