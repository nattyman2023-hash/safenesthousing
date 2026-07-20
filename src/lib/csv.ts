function safeCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  return [headers, ...rows.map((row) => headers.map((header) => row[header]))].map((row) => row.map(safeCell).join(',')).join('\r\n') + '\r\n';
}
