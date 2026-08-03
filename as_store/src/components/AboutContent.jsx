import Link from "next/link";
import Reveal from "./Reveal.jsx";
import Icon from "./Icon.jsx";
import BrandWall from "./about/BrandWall.jsx";
import { brandLogoSlug } from "@/lib/brandLogos";

const stats = [
  { value: "2008", label: "Serving Lebanon since" },
  { value: "brands", label: "Trusted brands", dynamic: true },
  { value: "1,000s", label: "Products in stock" },
  { value: "12-mo", label: "Warranty coverage" },
];

const values = [
  {
    icon: "check",
    title: "100% genuine",
    body: "Every product is authentic and sourced through official channels — no imitations, ever.",
  },
  {
    icon: "box",
    title: "Delivered nationwide",
    body: "Fast delivery to your door anywhere in Lebanon, carefully packed and tracked.",
  },
  {
    icon: "bag",
    title: "Cash on delivery",
    body: "Pay in cash when your order arrives. Simple, safe, and no surprises.",
  },
  {
    icon: "whatsapp",
    title: "Real human support",
    body: "Questions or bulk orders? Chat with our team on WhatsApp and we'll take care of you.",
  },
];

// The About page: a cinematic dark hero, stats band, brand story, value cards,
// a scrolling wall of the brands we carry, and a closing shop CTA.
export default function AboutContent({ settings, brands = [] }) {
  const total = brands.length;
  const logoBrands = brands
    .map((b) => ({
      name: b.name,
      imageUrl: b.imageUrl || "",
      logo: brandLogoSlug(b.name),
    }))
    .filter((b) => b.imageUrl || b.logo);
  const names = brands.map((b) => b.name).slice(0, 90);

  const waDigits = String(settings?.contact?.whatsapp || "").replace(/\D/g, "");
  const waHref = waDigits ? `https://wa.me/${waDigits}` : "/pages/support";

  return (
    <div className="bg-white">
      {/* ============ Hero ============ */}
      <section className="relative flex min-h-[86svh] items-center overflow-hidden bg-[#0B0D0E] pt-28 pb-20 sm:pt-32">
        <div className="pointer-events-none absolute -left-40 top-[-10%] h-[60vh] w-[60vh] rounded-full bg-as-red/25 blur-[150px]" />
        <div className="pointer-events-none absolute -right-40 bottom-[-20%] h-[70vh] w-[70vh] rounded-full bg-as-red-dark/25 blur-[160px]" />
        <p
          aria-hidden
          className="text-stroke-white pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none whitespace-nowrap text-[24vw] font-black leading-none tracking-tight"
        >
          AS STORE
        </p>

        <div className="shell-wide relative z-10">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-as-red-light">
              AS Store · by Absolute Solutions SAL
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-4 max-w-4xl text-[40px] font-bold leading-[1.05] tracking-apple text-white sm:text-6xl lg:text-7xl">
              Lebanon&rsquo;s home for the tech you love.
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-6 max-w-2xl text-lg text-white/60 sm:text-xl">
              We&rsquo;re the online store of AS Company — a market leader in
              telecommunication and electronics across Lebanon since 2008.
              Genuine products, honest prices, and the brands you trust,
              delivered to your door.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/shop" className="pill px-8 py-3 text-base">
                Shop the store
              </Link>
              <a
                href={waHref}
                target={waDigits ? "_blank" : undefined}
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-8 py-3 text-base font-medium text-white/90 transition hover:border-white/50 hover:text-white"
              >
                Talk to us
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ Stats band ============ */}
      <section className="border-b border-as-ink/10 bg-white">
        <div className="shell-wide grid grid-cols-2 gap-y-8 py-14 sm:py-16 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06} className="text-center">
              <p className="text-4xl font-bold tracking-apple text-as-red sm:text-5xl">
                {s.dynamic ? `${total || 170}+` : s.value}
              </p>
              <p className="mt-2 text-sm text-as-ink/55">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============ Story ============ */}
      <section className="bg-white py-20 sm:py-28">
        <div className="shell-wide grid grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-apple text-as-ink sm:text-4xl">
              Built on 15+ years of trust.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="space-y-5 text-lg leading-relaxed text-as-ink/70">
              <p>
                AS Company (Absolute Solutions SAL) has been at the forefront of
                telecommunication and electronics in Lebanon since 2008 —
                supplying businesses and homes with the technology that keeps
                the country connected.
              </p>
              <p>
                AS Store is our online storefront: the same expertise and
                authentic products, now a few taps away. From smartphones and
                laptops to audio, networking, and accessories, we bring the
                world&rsquo;s leading brands together in one place you can rely
                on.
              </p>
              <p>
                Our promise is simple — real products, fair prices, and a team
                that actually cares about getting it right for you.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ Values ============ */}
      <section className="bg-as-fog py-20 sm:py-24">
        <div className="shell-wide">
          <Reveal>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-apple text-as-ink sm:text-4xl">
              Why shop with AS Store
            </h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => (
              <Reveal key={v.title} delay={i * 0.07}>
                <div className="flex h-full flex-col rounded-[24px] border border-as-ink/10 bg-white p-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-as-red/10 text-as-red">
                    <Icon name={v.icon} className="h-6 w-6" strokeWidth={2} />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold tracking-apple text-as-ink">
                    {v.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-as-ink/60">
                    {v.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ Brands ============ */}
      <section className="bg-as-fog pb-24 pt-4">
        <div className="shell-wide">
          <Reveal className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-as-red">
              Our brands
            </p>
            <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-semibold tracking-apple text-as-ink sm:text-4xl">
              The world&rsquo;s best brands, all in one store
            </h2>
          </Reveal>
        </div>
        <div className="mt-12">
          <BrandWall logoBrands={logoBrands} names={names} total={total} />
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="bg-as-red">
        <div className="shell-wide flex flex-col items-center gap-6 py-20 text-center sm:py-24">
          <Reveal>
            <h2 className="max-w-2xl text-3xl font-bold tracking-apple text-white sm:text-5xl">
              Ready to find your next device?
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <Link
              href="/shop"
              className="inline-flex items-center justify-center rounded-full bg-white px-9 py-3.5 text-base font-semibold text-as-red transition hover:bg-white/90 active:scale-[.98]"
            >
              Start shopping
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
