import { steps } from "../content";
import { Container, SectionHeading } from "./ui";

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className="relative border-y border-line bg-surface py-20 sm:py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
      />
      <Container className="relative">
        <SectionHeading
          id="how-title"
          eyebrow="Three calm steps"
          title="Connected in under a minute."
          lede="No port forwarding, no VPN, no settings. If both computers can open a web page, they can connect."
        />

        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="relative rounded-2xl border border-line bg-canvas p-7">
              <span className="font-display text-sm font-semibold text-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-8 font-display text-xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
