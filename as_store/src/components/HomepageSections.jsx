import Hero from './Hero.jsx'
import PinnedShowcase from './PinnedShowcase.jsx'
import ProductRail from './ProductRail.jsx'
import BentoGrid from './BentoGrid.jsx'
import Reveal from './Reveal.jsx'

// Closing call-to-action block: heading, subheading, any number of pill buttons.
function CtaSection({ section }) {
  const { heading, subheading, bg, textTheme } = section
  const buttons = Array.isArray(section.settings?.buttons) ? section.settings.buttons : []
  const onDark = textTheme === 'dark'
  return (
    <section className="py-24 text-center" style={{ backgroundColor: bg || '#ffffff' }}>
      <div className="shell">
        <Reveal>
          {heading && (
            <h2 className={`text-4xl font-semibold tracking-apple sm:text-5xl ${onDark ? 'text-white' : 'text-as-ink'}`}>
              {heading}
            </h2>
          )}
          {subheading && (
            <p className={`mx-auto mt-3 max-w-lg text-lg ${onDark ? 'text-white/60' : 'text-as-ink/60'}`}>
              {subheading}
            </p>
          )}
          {buttons.length > 0 && (
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              {buttons.map((b, i) => (
                <a key={i} href={b.href || '#'} className="pill">
                  {b.label}
                </a>
              ))}
            </div>
          )}
        </Reveal>
      </div>
    </section>
  )
}

// Generic free-text block: heading + body paragraphs (split on blank lines).
function RichTextSection({ section }) {
  const { heading, body, bg, textTheme } = section
  const onDark = textTheme === 'dark'
  const align = section.settings?.align === 'left' ? 'text-left' : 'text-center'
  const paragraphs = (body || '').split(/\n{2,}/).filter(Boolean)
  return (
    <section className="py-20" style={{ backgroundColor: bg || '#ffffff' }}>
      <div className={`mx-auto w-full max-w-[760px] px-6 ${align}`}>
        <Reveal>
          {heading && (
            <h2 className={`text-3xl font-semibold tracking-apple sm:text-4xl ${onDark ? 'text-white' : 'text-as-ink'}`}>
              {heading}
            </h2>
          )}
          {paragraphs.length > 0 && (
            <div className={`mt-6 space-y-4 text-lg leading-relaxed ${onDark ? 'text-white/70' : 'text-as-ink/70'}`}>
              {paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>
          )}
        </Reveal>
      </div>
    </section>
  )
}

const RENDERERS = {
  hero: Hero,
  showcase: PinnedShowcase,
  productRail: ProductRail,
  bento: BentoGrid,
  cta: CtaSection,
  richtext: RichTextSection,
}

// Renders the CMS homepage: each visible section in order, mapped to its block
// component. Unknown types are skipped.
export default function HomepageSections({ sections = [] }) {
  return (
    <>
      {sections
        .filter((s) => s.visible !== false)
        .map((s) => {
          const Cmp = RENDERERS[s.type]
          return Cmp ? <Cmp key={s.id} section={s} /> : null
        })}
    </>
  )
}
