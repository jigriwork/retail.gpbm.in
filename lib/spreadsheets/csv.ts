// Quoting alone does not stop Excel/LibreOffice from interpreting formulas.
export function csvEscape(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s\u0000-\u001f\u007f\ufeff]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
