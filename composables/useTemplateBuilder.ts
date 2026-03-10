import { nanoid } from 'nanoid';
import type {
  CanvasBlock,
  EmailPartial,
  NewsletterBlock,
  TemplateBlockWithBlock,
} from '~/types/email/blocks';

export function useTemplateBuilder(templateId: Ref<number>) {
  const { previewNewsletter } = useEmailTemplates();
  const { getDefaultPartial, getPartial } = useEmailPartials();
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
      variables: tb.instance_variables || {},
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
    const [header, footer, webBar] = await Promise.all([
      headerId ? getPartial(headerId) : getDefaultPartial('header'),
      footerId ? getPartial(footerId) : getDefaultPartial('footer'),
      getDefaultPartial('web_version_bar'),
    ]);
    headerPartial.value = header;
    footerPartial.value = footer;
    webVersionBarPartial.value = webBar;
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
  const resolvePartialMjml = (partial: EmailPartial | null): string => {
    if (!partial) return '';
    let source = partial.mjml_source;
    const vars = partial.instance_variables || {};
    // Replace design-time variables
    if (partial.variables_schema) {
      for (const def of partial.variables_schema) {
        const value = vars[def.key] ?? def.default ?? '';
        source = source.replaceAll(`{{{${def.key}}}}`, String(value));
      }
    }
    return source;
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

    // Canvas blocks
    for (const cb of canvas.value) {
      let source = cb.block.mjml_source;
      for (const [key, value] of Object.entries(cb.variables)) {
        source = source.replaceAll(`{{{${key}}}}`, String(value ?? ''));
      }
      sections.push(source);
    }

    // Footer partial
    if (includeFooter.value && footerPartial.value) {
      sections.push(resolvePartialMjml(footerPartial.value));
    }

    return `<mjml>
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
  function getDefaultVariables(block: NewsletterBlock): Record<string, any> {
    if (!block.variables_schema) return {};
    return Object.fromEntries(
      block.variables_schema.map((v) => [v.key, v.default ?? ''])
    );
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
    assembleMjml,
    refreshPreview,
    save,
  };
}
