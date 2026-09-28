import { faqs } from "../content";
import { PlusIcon } from "./icons";
import { Container, SectionHeading, cx, focusRing } from "./ui";

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="border-t border-line py-20 sm:py-28">
      <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <SectionHeading
          id="faq-title"
          eyebrow="Questions"
          title="Good to know."
          lede="Straight answers about cost, privacy and what the other person can and cannot do."
        />

        <div className="divide-y divide-line border-y border-line">
          {faqs.map((faq) => (
            <details key={faq.question} className="group">
              <summary
                className={cx(
                  "flex cursor-pointer list-none items-center justify-between gap-6 rounded-md py-5 font-display text-lg font-semibold tracking-tight transition-colors hover:text-accent [&::-webkit-details-marker]:hidden",
                  focusRing,
                )}
              >
                {faq.question}
                <PlusIcon className="size-5 shrink-0 text-subtle transition-transform duration-200 group-open:rotate-45 group-open:text-accent" />
              </summary>
              <p className="-mt-1 pr-10 pb-6 text-sm leading-relaxed text-muted sm:text-base">{faq.answer}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
