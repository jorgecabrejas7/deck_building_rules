// A deck in a link: the list and commander pick as deflated, base64url JSON for "#d=".
// Pure, so it runs in the app and in the parity test.

// A link is untrusted and deflate can expand a thousandfold. Thousands of card lines still fit.
const MAX_BYTES = 200_000;

export async function encodeShare({ text, commanders }) {
  const json = new Blob([JSON.stringify({ t: text, c: commanders })]);
  const bytes = new Uint8Array(await new Response(json.stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// null for anything that is not a deck made by encodeShare; it never throws.
export async function decodeShare(code) {
  try {
    const bytes = Uint8Array.from(atob(code.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
    const chunks = [];
    for (let total = 0; ;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) { reader.cancel().catch(() => {}); return null; }
      chunks.push(value);
    }
    const { t, c } = JSON.parse(await new Blob(chunks).text());
    const namesOk = c === null || (Array.isArray(c) && c.every(n => typeof n === "string"));
    return typeof t === "string" && t.trim() && namesOk ? { text: t, commanders: c } : null;
  } catch (e) { return null; }
}
