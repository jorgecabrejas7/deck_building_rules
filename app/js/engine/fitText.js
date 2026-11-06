// Fitting text into a fixed space, whatever measures it (a canvas, or a stub in the tests).
export function wrapLines(text, maxWidth, measure) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && measure(next) > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export const moreList = (items, max, sep = ' · ') =>
  items.slice(0, max).join(sep) + (items.length > max ? ' +' + (items.length - max) : '');

// As many items as fit, the rest counted as "+N". If not even the first fits it is cut
// short, keeping the count.
export function fitList(items, fits) {
  if (!items.length) return '';
  for (let k = items.length; k > 0; k--) {
    const s = moreList(items, k);
    if (fits(s)) return s;
  }
  const more = items.length > 1 ? ' +' + (items.length - 1) : '';
  let head = items[0];
  while (head && !fits(head + '…' + more)) head = head.slice(0, -1);
  return head + '…' + more;
}
