const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** Strips HTML, URLs and @mentions; keeps cashtags ($AAPL), words of hashtags and emojis. */
export function cleanText(input: string): string {
  return (input ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/(^|\s)@\w+/g, " ")
    .replace(/#(\w+)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function joinTitleBody(title: string, body?: string): string {
  const t = cleanText(title);
  const b = cleanText(body ?? "");
  if (!b) return t;
  return /[.!?]$/.test(t) ? `${t} ${b}` : `${t}. ${b}`;
}
