'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

// Publish gate for the public storefront (mirrors the marketing site's
// Coming Soon behavior). When settings.published is off, visitors see the
// holding page; staff can bypass with ?preview=1 (remembered for the browsing
// session). /admin lives outside this layout and is never gated.
function Gate({ published, fallback, children }) {
  const sp = useSearchParams()
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    if (sp.get('preview') === '1') {
      sessionStorage.setItem('as_store_preview', '1')
      setPreview(true)
    } else {
      setPreview(sessionStorage.getItem('as_store_preview') === '1')
    }
  }, [sp])

  if (published || preview) return children
  return fallback
}

export default function PublishGate(props) {
  // useSearchParams needs a Suspense boundary; while it resolves, show the
  // same thing the server rendered so nothing flashes.
  return (
    <Suspense fallback={props.published ? props.children : props.fallback}>
      <Gate {...props} />
    </Suspense>
  )
}
