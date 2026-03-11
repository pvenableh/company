export function useCsvTemplate() {
  const downloadTemplate = () => {
    const headers = [
      'first_name', 'last_name', 'email', 'prefix',
      'phone', 'job_title', 'company', 'industry',
      'website', 'city', 'state', 'country', 'tags', 'notes',
    ];

    const exampleRow = [
      'Jane', 'Smith', 'jane@example.com', 'Ms.',
      '(555) 123-4567', 'Director of Marketing', 'Acme Corp', 'Technology',
      'https://acme.com', 'Miami', 'FL', 'United States', 'vip,newsletter', 'Met at conference',
    ];

    const csv = [headers.join(','), exampleRow.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return { downloadTemplate };
}
