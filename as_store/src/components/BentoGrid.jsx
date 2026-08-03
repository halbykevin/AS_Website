import Reveal from "./Reveal.jsx";

// Apple "lineup" bento: heading + image tiles (light or dark), CMS-driven via
// `section.settings.tiles`. Entrance via Reveal; image gently zooms on hover.
export default function BentoGrid({ section = {} }) {
  const { heading, bg } = section;
  const tiles = Array.isArray(section.settings?.tiles)
    ? section.settings.tiles
    : [];
  const onDark = section.textTheme === "dark";

  return (
    <section
      className="py-16 sm:py-24"
      style={{ backgroundColor: bg || "#ffffff" }}
    >
      <div className="shell-wide">
        {heading && (
          <Reveal>
            <h2
              className={`mb-10 text-center text-4xl font-semibold tracking-apple sm:text-5xl ${onDark ? "text-white" : "text-as-ink"}`}
            >
              {heading}
            </h2>
          </Reveal>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t, i) => {
            const dark = t.tone === "dark";
            return (
              <Reveal
                key={`${t.title}-${i}`}
                delay={(i % 3) * 0.08}
                className={t.span || ""}
              >
                <a
                  href={t.href || "#"}
                  className={`group flex h-[440px] flex-col overflow-hidden rounded-[28px] text-center ${
                    dark ? "bg-black text-white" : "bg-as-fog text-as-ink"
                  }`}
                >
                  <div className="px-8 pt-10">
                    <h3 className="text-2xl font-semibold tracking-apple sm:text-3xl">
                      {t.title}
                    </h3>
                    {t.copy && (
                      <p
                        className={`mt-1 text-base ${dark ? "text-white/65" : "text-as-ink/55"}`}
                      >
                        {t.copy}
                      </p>
                    )}
                    <div className="mt-3 flex items-center justify-center gap-5 text-[15px] font-medium">
                      <span className="text-as-red-light group-hover:underline">
                        Learn more ›
                      </span>
                      <span
                        className={
                          dark
                            ? "text-white group-hover:underline"
                            : "text-as-red group-hover:underline"
                        }
                      >
                        Shop ›
                      </span>
                    </div>
                  </div>
                  {t.image && (
                    <div className="mt-6 w-full flex-1 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={t.image}
                        alt={t.title}
                        className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                    </div>
                  )}
                </a>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
