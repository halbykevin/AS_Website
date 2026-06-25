import { notFound } from 'next/navigation'
import { loadPage } from '@/lib/site'

// Renders a CMS content page at /pages/<slug>. Body paragraphs are split on
// blank lines.
export async function generateMetadata({ params }) {
  const page = await loadPage(params.slug)
  return { title: page ? `${page.title} — AS Store` : 'AS Store' }
}

export default async function ContentPage({ params }) {
  const page = await loadPage(params.slug)
  if (!page || page.visible === false) notFound()

  const paragraphs = (page.body || '').split(/\n{2,}/).filter(Boolean)

  return (
    <article className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="mx-auto w-full max-w-[760px] px-6">
        <h1 className="text-4xl font-semibold tracking-apple text-as-ink sm:text-5xl">{page.title}</h1>
        <div className="mt-8 space-y-5 text-lg leading-relaxed text-as-ink/70">
          {paragraphs.length > 0 ? (
            paragraphs.map((para, i) => (
              <p key={i} className="whitespace-pre-line">
                {para}
              </p>
            ))
          ) : (
            <p className="text-as-ink/40">This page has no content yet.</p>
          )}
        </div>
      </div>
    </article>
  )
}
