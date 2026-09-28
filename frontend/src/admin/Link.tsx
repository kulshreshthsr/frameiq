import type { AnchorHTMLAttributes } from 'react'
import { navigate } from './router'

/** A same-origin admin link that navigates through the tiny router instead
 * of a full page load, but still works as a real link (open in new tab,
 * copy link address, etc.) since it's a real `<a href>`. */
export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      {...rest}
      href={to}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(to)
      }}
    />
  )
}
