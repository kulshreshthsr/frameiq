/** Frees a previous upload's memory. Object URLs from earlier photos are
 * never needed again once nothing references them, so releasing them keeps a
 * long editing session from silently accumulating decoded-image memory. */
export function revokeIfBlobUrl(src: string | null | undefined) {
  if (src && src.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(src)
  }
}
