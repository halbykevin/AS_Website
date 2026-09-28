import type { ReactNode } from "react";

/** Joins class names, skipping falsy entries. */
export const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

const buttonBase = cx(
  "inline-flex items-center justify-center gap-2.5 rounded-lg font-semibold whitespace-nowrap",
  "transition-[color,background-color,box-shadow,translate] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0",
  focusRing,
);

const buttonVariants = {
  primary: "bg-brand-600 text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700",
  secondary: "border border-line bg-surface text-fg hover:border-subtle/60 hover:bg-raised",
  ghost: "text-fg hover:text-accent",
} as const;

const buttonSizes = { sm: "h-9 px-3.5 text-sm", md: "h-12 px-5 text-sm", inline: "text-sm" } as const;

export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: { variant?: keyof typeof buttonVariants; size?: keyof typeof buttonSizes; className?: string } = {}) {
  return cx(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("text-xs font-bold tracking-[0.16em] text-accent uppercase", className)}>{children}</p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  id,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cx("max-w-2xl", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        id={id}
        className="mt-4 font-display text-4xl leading-[1.05] font-semibold tracking-display text-balance sm:text-5xl"
      >
        {title}
      </h2>
      {lede && <p className="mt-5 text-base leading-relaxed text-pretty text-muted sm:text-lg">{lede}</p>}
    </div>
  );
}
