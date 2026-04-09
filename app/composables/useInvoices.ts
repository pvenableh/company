import type { Invoice, Product } from '~~/types/directus';

export function useInvoices() {
  const items = useDirectusItems<Invoice>('invoices');
  const productItems = useDirectusItems<Product>('products');
  const { selectedOrg, getOrganizationFilter, organizations } = useOrganization();
  const { getClientFilter } = useClients();
  const { canAccess } = useOrgRole();

  const getInvoices = async (params?: {
    status?: string;
    search?: string;
    sort?: string[];
    limit?: number;
    page?: number;
  }): Promise<{ data: Invoice[]; total: number }> => {
    const filter: any = { _and: [] };
    const isAdmin = canAccess('invoices');

    // Org-scoped via bill_to
    const orgFilter = getOrganizationFilter();
    if (orgFilter?.organization) {
      filter._and.push({ bill_to: orgFilter.organization });
    }

    // Non-admins without selected org: filter to their orgs
    if (!selectedOrg.value && !isAdmin && organizations.value?.length) {
      const userOrgIds = organizations.value.map((org: any) => org.id);
      filter._and.push({ bill_to: { id: { _in: userOrgIds } } });
    }

    // Client filter
    const clientFilter = getClientFilter();
    if (Object.keys(clientFilter).length > 0) {
      filter._and.push(clientFilter);
    }

    if (params?.status && params.status !== 'all') {
      filter._and.push({ status: { _eq: params.status } });
    }

    if (params?.search) {
      filter._and.push({
        _or: [
          { invoice_code: { _icontains: params.search } },
          { bill_to: { name: { _icontains: params.search } } },
        ],
      });
    }

    const data = await items.list({
      fields: [
        'id', 'status', 'due_date', 'invoice_date', 'invoice_code',
        'total_amount', 'note', 'memo', 'melio',
        'bill_to.id', 'bill_to.name',
        'client.id', 'client.name',
        'line_items.id', 'line_items.description', 'line_items.quantity',
        'line_items.rate', 'line_items.amount', 'line_items.product.name',
        'payments.id', 'payments.status', 'payments.amount',
      ],
      filter: filter._and.length ? filter : undefined,
      sort: params?.sort || ['-due_date'],
      limit: params?.limit || 100,
      page: params?.page || 1,
    });

    const total = await items.count(filter._and.length ? filter : undefined);

    return { data, total };
  };

  const getInvoice = async (id: string): Promise<Invoice> => {
    return items.get(id, {
      fields: [
        '*',
        'bill_to.*', 'bill_to.owner.email',
        'client.id', 'client.name', 'client.billing_email', 'client.billing_name', 'client.billing_address', 'client.billing_contacts', 'client.parent_client.id', 'client.parent_client.name', 'client.parent_client.billing_email', 'client.parent_client.billing_name', 'client.parent_client.billing_address', 'client.parent_client.billing_contacts',
        'project.id', 'project.title',
        'line_items.*', 'line_items.product.*',
        'payments.*',
      ],
    });
  };

  const createInvoice = async (payload: any): Promise<Invoice> => {
    // Auto-snapshot billing fields and bill_to from client if not already provided
    // For sub-brands: falls back to parent_client billing details when the client has none
    if (payload.client) {
      try {
        const clientItems = useDirectusItems('clients');
        const client = await clientItems.get(payload.client, {
          fields: [
            'billing_email', 'billing_name', 'billing_address', 'billing_contacts', 'name', 'organization',
            'parent_client.id', 'parent_client.billing_email', 'parent_client.billing_name',
            'parent_client.billing_address', 'parent_client.billing_contacts', 'parent_client.name',
            'parent_client.organization',
          ],
        }) as any;

        if (client) {
          const parent = client.parent_client;

          // Auto-set bill_to from client's organization (or parent's organization for sub-brands)
          if (!payload.bill_to) {
            const org = client.organization || parent?.organization;
            if (org) {
              payload.bill_to = typeof org === 'object' ? org.id : org;
            }
          }

          // Resolve billing: client fields → parent_client fields → skip
          if (!payload.billing_email) {
            const clientContacts = Array.isArray(client.billing_contacts)
              ? client.billing_contacts.find((c: any) => c.email?.trim())
              : null;
            const parentContacts = Array.isArray(parent?.billing_contacts)
              ? parent.billing_contacts.find((c: any) => c.email?.trim())
              : null;

            const hasBilling = clientContacts || client.billing_email;

            const source = hasBilling ? client : (parent || client);
            const primaryContact = hasBilling ? clientContacts : parentContacts;

            payload.billing_email = primaryContact?.email
              || source.billing_email
              || null;
            payload.billing_name = primaryContact?.name
              || source.billing_name
              || source.name
              || null;
            payload.billing_address = source.billing_address || null;
          }
        }
      } catch {
        // Non-fatal — billing snapshot is optional
      }
    }

    const result = await items.create(payload);
    // Re-fetch to get flow-calculated amounts
    return getInvoice((result as any).id);
  };

  const updateInvoice = async (id: string, payload: any): Promise<Invoice> => {
    await items.update(id, payload);
    // Re-fetch to get flow-calculated amounts
    return getInvoice(id);
  };

  const deleteInvoice = async (id: string): Promise<boolean> => {
    return items.remove(id);
  };

  const getProducts = async (): Promise<Product[]> => {
    return productItems.list({
      fields: ['id', 'name', 'price', 'type'],
      sort: ['name'],
      limit: 200,
    });
  };

  /**
   * Generate the next invoice code for a client.
   * Format: INV-{CLIENT_CODE}-{YEAR}-{PADDED_NUMBER} (e.g. INV-AGC-2026-0001)
   * Year is derived from invoiceDate (falls back to current date).
   * Count is based on all invoices for this client in that year (by invoice_date).
   */
  const generateInvoiceCode = async (clientId: string, invoiceDate?: string): Promise<string | null> => {
    const clientItems = useDirectusItems('clients');

    try {
      // Fetch the client's code
      const client = await clientItems.get(clientId, { fields: ['id', 'code'] });
      const code = (client as any)?.code;
      if (!code) return null;

      // Derive year from invoice date or current date
      let year = new Date().getFullYear();
      if (invoiceDate) {
        const parsed = new Date(invoiceDate);
        if (!isNaN(parsed.getTime())) {
          year = parsed.getFullYear();
        }
      }

      // Find the highest existing invoice number for this client code + year
      const clientCode = code.toUpperCase();
      const prefix = `INV-${clientCode}-${year}-`;

      const existingInvoices = await items.list({
        fields: ['invoice_code'],
        filter: {
          invoice_code: { _starts_with: prefix },
        },
        limit: -1,
      });

      // Extract the max number from existing codes
      let maxNum = 0;
      for (const inv of existingInvoices) {
        const match = (inv as any).invoice_code?.match(new RegExp(`^${prefix}(\\d+)$`));
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }

      const nextNum = maxNum + 1;
      return `${prefix}${String(nextNum).padStart(4, '0')}`;
    } catch (e) {
      console.warn('Could not generate invoice code:', e);
      return null;
    }
  };

  return {
    getInvoices,
    getInvoice,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    getProducts,
    generateInvoiceCode,
  };
}
