"use client";

import { motion } from "framer-motion";
import Icon from "./Icon.jsx";

const EASE = [0.22, 0.61, 0.36, 1];
// Staggered entrance for the stacked text lines.
const up = (delay) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease: EASE },
});

// Centered Apple hero, fully CMS-driven: eyebrow, big tight headline, subhead,
// any number of chevron link buttons, then an optional image that scales in.
export default function Hero({ section = {} }) {
  const { eyebrow, heading, subheading, imageUrl, bg, textTheme } = section;
  const buttons = Array.isArray(section.settings?.buttons)
    ? section.settings.buttons
    : [];
  const onDark = textTheme === "dark";

  return (
    <section
      className="relative overflow-hidden pt-24 text-center sm:pt-28"
      style={{ backgroundColor: bg || "#ffffff" }}
    >
      <div className="shell">
        {eyebrow && (
          <motion.p
            {...up(0)}
            className="text-lg font-semibold text-as-red sm:text-xl"
          >
            {eyebrow}
          </motion.p>
        )}
        {heading && (
          <motion.h1
            {...up(0.06)}
            className={`mt-2 text-5xl font-semibold tracking-apple sm:text-7xl ${onDark ? "text-white" : "text-as-ink"}`}
          >
            {heading}
          </motion.h1>
        )}
        {subheading && (
          <motion.p
            {...up(0.13)}
            className={`mx-auto mt-4 max-w-xl text-xl sm:text-2xl ${onDark ? "text-white/70" : "text-as-ink/60"}`}
          >
            {subheading}
          </motion.p>
        )}
        {buttons.length > 0 && (
          <motion.div
            {...up(0.2)}
            className="mt-6 flex items-center justify-center gap-6"
          >
            {buttons.map((b, i) => (
              <a key={i} href={b.href || "#"} className="link-cta">
                {b.label} <Icon name="chevronRight" className="h-4 w-4" />
              </a>
            ))}
          </motion.div>
        )}
      </div>

      {imageUrl && (
        <motion.div
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.15, delay: 0.1, ease: EASE }}
          className="mx-auto mt-12 max-w-[1100px] px-6"
        >
          <div className="overflow-hidden rounded-[28px] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.4)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={heading || ""}
              className="aspect-[16/10] w-full object-cover"
            />
          </div>
        </motion.div>
      )}
    </section>
  );
}
