import { audiences, features } from "../content";
import { Container, SectionHeading } from "./ui";

export function Features() {
  return (
    <section id="features" aria-labelledby="features-title" className="border-t border-line py-20 sm:py-28">
      <Container>
        <SectionHeading
          id="features-title"
          eyebrow="Everything included"
          title="Full remote control, with the brakes on the other side."
          lede="Every feature is in the free download. The person sharing their screen stays in charge from the first request to the last click."
        />

        <ul className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <li key={title} className="group bg-surface p-7 transition-colors hover:bg-raised sm:p-8">
              <span className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20 transition-transform motion-safe:group-hover:-translate-y-0.5">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-6 font-display text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function Audiences() {
  return (
    <section aria-labelledby="audiences-title" className="pb-20 sm:pb-28">
      <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <SectionHeading
          id="audiences-title"
          eyebrow="Made for real support"
          title="Help from the other side of the desk."
        />
        <ul className="grid gap-8 sm:grid-cols-3 sm:gap-6">
          {audiences.map(({ icon: Icon, title, body }) => (
            <li key={title} className="border-t border-line pt-6">
              <Icon className="size-5 text-accent" />
              <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
