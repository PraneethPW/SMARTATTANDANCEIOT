export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Prevent spreadsheet software interpreting text fields as formulas.
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
