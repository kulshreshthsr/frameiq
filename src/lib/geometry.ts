/** Scale + display size for fitting a wall image inside a viewport, like CSS object-fit: contain. */
export function fitContain(
  containerWidth: number,
  containerHeight: number,
  contentWidth: number,
  contentHeight: number,
) {
  if (contentWidth <= 0 || contentHeight <= 0) {
    return { scale: 1, width: containerWidth, height: containerHeight }
  }
  const scale = Math.min(containerWidth / contentWidth, containerHeight / contentHeight)
  return {
    scale,
    width: contentWidth * scale,
    height: contentHeight * scale,
  }
}

/** Scale needed for content to cover a container without leaving gaps, like CSS background-size: cover. */
export function coverScale(
  containerWidth: number,
  containerHeight: number,
  contentWidth: number,
  contentHeight: number,
) {
  if (contentWidth <= 0 || contentHeight <= 0) return 1
  return Math.max(containerWidth / contentWidth, containerHeight / contentHeight)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
