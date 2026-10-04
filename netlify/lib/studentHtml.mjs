import { parseFragment, serialize } from 'parse5';

export function studentHtml(html) {
  const tree = parseFragment(String(html || ''));
  const scrub = node => {
    node.childNodes = (node.childNodes || []).filter(child => {
      const classes = child.attrs?.find(attr => attr.name === 'class')?.value.split(/\s+/) || [];
      return !classes.includes('teacher-only') && !['script', 'iframe', 'object', 'embed', 'template'].includes(child.tagName);
    });
    for (const child of node.childNodes) {
      if (child.nodeName === '#comment') child.data = '';
      if (child.attrs) child.attrs = child.attrs.filter(attr => !attr.name.startsWith('on') && !/^data-(answer|correct|solution)/.test(attr.name));
      scrub(child);
    }
  };
  scrub(tree);
  return serialize(tree);
}
