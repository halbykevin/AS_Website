import { freePerks } from "../content";
import { DirectDownloadLink } from "./Download";
import { CheckIcon, DownloadIcon } from "./icons";
import { Container, SectionHeading, buttonClass } from "./ui";

export function Pricing() {
  return (
    <section id="free" aria-labelledby="free-title" className="py-20 sm:py-28">
      <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <SectionHeading
          id="free-title"
          eyebrow="Pricing"
          title="Free means free."
          lede="No trial that runs out, no “commercial use detected” pop-ups, no premium tier with the good features. One app, the same for everyone."
        />

        <div className="rounded-3xl border border-line bg-surface p-8 shadow-xl shadow-black/5 sm:p-10 dark:shadow-black/30">
          <div className="flex items-end gap-3">
            <span className="font-display text-7xl leading-none font-semibold tracking-display">$0</span>
            <span className="pb-2 text-sm text-muted">forever, for everyone</span>
          </div>
          <ul className="mt-8 grid gap-3.5 sm:grid-cols-2">
            {freePerks.map((perk) => (
              <li key={perk} className="flex items-center gap-3 text-sm font-medium">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckIcon className="size-3.5" />
                </span>
                {perk}
              </li>
            ))}
          </ul>
          <DirectDownloadLink className={buttonClass({ className: "mt-9 w-full" })}>
            Download ASDesk <DownloadIcon />
          </DirectDownloadLink>
        </div>
      </Container>
    </section>
  );
}
