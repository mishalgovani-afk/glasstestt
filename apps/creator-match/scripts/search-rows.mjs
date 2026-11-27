// Minimal parser for Steam store search rows (infinite=1 results_html): appid, name and review count only.
// (Duplicated in small form from Page Doctor's parser; the apps do not import from each other.)
const decode = (s) => String(s ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
export function parseSearchRows(resultsHtml) {
  const chunks = String(resultsHtml ?? "").split(/(?=<a\b[^>]*search_result_row)/).filter((c) => /search_result_row/.test(c.slice(0, 2500)));
  const rows = [];
  for (const c of chunks) {
    const id = c.match(/data-ds-appid="(\d+)"/);
    if (!id) continue;
    const title = c.match(/<span class="title">([\s\S]*?)<\/span>/);
    const tip = c.match(/data-tooltip-html="([^"]*)"/);
    const rev = tip ? decode(tip[1]).match(/of the ([\d,]+) user reviews/) : null;
    rows.push({ appid: Number(id[1]), name: title ? decode(title[1]).trim() : "", reviewTotal: rev ? Number(rev[1].replace(/,/g, "")) : null });
  }
  return rows.filter((r) => r.name);
}
