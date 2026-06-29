import HomepageSections from '@/components/HomepageSections.jsx'
import { loadHomepageSections } from '@/lib/homepage'

// AS Store homepage — fully CMS-driven: an ordered list of editable blocks
// (hero, pinned showcase, product rails, bento, CTA, rich text) managed at
// /admin/homepage. Falls back to the original layout if the API is offline.
export default async function HomePage() {
  const sections = await loadHomepageSections()
  return <HomepageSections sections={sections} />
}
