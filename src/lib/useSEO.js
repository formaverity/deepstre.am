import { useEffect } from 'react'

function setMeta(attr, val, content) {
  let el = document.querySelector(`meta[${attr}="${val}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, val)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export function useSEO({ title, description, image }) {
  useEffect(() => {
    if (title) {
      document.title = title
      setMeta('property', 'og:title', title)
      setMeta('name', 'twitter:title', title)
    }
    if (description) {
      setMeta('name', 'description', description)
      setMeta('property', 'og:description', description)
      setMeta('name', 'twitter:description', description)
    }
    if (image) {
      setMeta('property', 'og:image', image)
      setMeta('name', 'twitter:image', image)
    }
    return () => {
      document.title = 'deepstre.am'
    }
  }, [title, description, image])
}
