/**
 * Shared browser-download mechanics for every export that produces a text
 * file client-side: build a `Blob`, mint an object URL, click a throwaway
 * anchor, then revoke the URL. Browser-only side effect — outside a DOM
 * environment the globals it relies on are absent and the call will throw.
 */
export function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
