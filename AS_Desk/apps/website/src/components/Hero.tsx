import { heroHighlights } from "../content";
import { HeroArt } from "./HeroArt";
import { HeroDownload } from "./Download";
import { CheckIcon } from "./icons";
import { Container } from "./ui";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -top-16 bg-hero-glow" />
      <Container className="relative grid items-center gap-12 pt-14 pb-20 sm:pt-20 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pt-24 lg:pb-28">
        <div>
          <h1
            id="hero-title"
            className="mt-6 font-display text-5xl leading-[0.98] font-semibold tracking-display text-balance sm:text-6xl xl:text-[4.25rem]"
          >
            Remote desktop,
            <span className="block text-accent">free for everyone.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted">
            ASDesk connects you to any Windows PC with a nine-digit ID. Help a friend, fix a parent's laptop or support a
            customer — no account, no license, no time limits. The person on the other side approves every session.
          </p>

          <HeroDownload />

          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-subtle">
            {heroHighlights.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <CheckIcon className="size-4 text-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <HeroArt />
      </Container>
    </section>
  );
}
