import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function compactTemplate(template) {
  const styles = [];
  const indices = new Map();
  const sheets = template.sheets.map(sheet => ({ ...sheet, cells: sheet.cells.map(cell => {
    if (!Object.hasOwn(cell, 's')) return cell;
    const key = JSON.stringify(cell.s);
    if (!indices.has(key)) { indices.set(key, styles.length); styles.push(cell.s); }
    return { ...cell, s: indices.get(key) };
  }) }));
  return { template: { ...template, sheets }, styles };
}

export function expandTemplate({ template, styles }) {
  const clone = value => Array.isArray(value) ? value.map(clone)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
  return { ...template, sheets: template.sheets.map(sheet => ({ ...sheet, cells: sheet.cells.map(cell => (
    Object.hasOwn(cell, 's') ? { ...cell, s: clone(styles[cell.s]) } : cell
  )) })) };
}

// Keep the original workbook export intact; only deduplicate the shipped styles.
export function templateModule(template) {
  return `export default (${expandTemplate.toString()})(${JSON.stringify(compactTemplate(template))});`;
}

export default function scorebookTemplatePlugin() {
  const path = fileURLToPath(new URL('../src/data/scorebookTemplate.json', import.meta.url));
  const target = path.replaceAll('\\', '/');
  return {
    name: 'vite-plugin-scorebook-template',
    enforce: 'post',
    async transform(_code, id) {
      if (id.replaceAll('\\', '/') !== target) return null;
      return { code: templateModule(JSON.parse(await readFile(path, 'utf8'))), map: null };
    }
  };
}
