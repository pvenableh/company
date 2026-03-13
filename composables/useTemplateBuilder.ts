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
    const temp = canvas.value[idx];
    canvas.value[idx] = canvas.value[newIdx];
    canvas.value[newIdx] = temp;
    reindex();
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
  function resolveVariableValue(value: any, type?: string): string {
    const str = String(value ?? '');
    if (str.trim() !== '') return str;
    // Type-aware fallbacks for empty values
    switch (type) {
      case 'color': return 'transparent';
      case 'boolean': return 'false';
      default: return '';
    }
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
        const value = resolveVariableValue(raw, def.type);
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
        const resolved = resolveVariableValue(value, def?.type);
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
  function getTypeDefault(type: string): any {
    switch (type) {
      case 'color': return 'transparent';
      case 'boolean': return false;
      default: return '';
    }
  }

  function getDefaultVariables(block: NewsletterBlock): Record<string, any> {
    const schema = parseVariablesSchema(block.variables_schema, block.mjml_source);
    if (!schema.length) return {};
    return Object.fromEntries(
      schema.map((v) => [v.key, v.default ?? getTypeDefault(v.type)])
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
        result[def.key] = def.default ?? getTypeDefault(def.type);
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
    assembleMjml,
    refreshPreview,
    save,
  };
}
