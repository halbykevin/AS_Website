import { useEffect, useState } from "react";
import { navLinks } from "../content";
import { useAppDispatch, useAppSelector } from "../hooks";
import { toggle } from "../store";
import { CloseIcon, DownloadIcon, MenuIcon, MoonIcon, SunIcon } from "./icons";
import { DirectDownloadLink } from "./Download";
import { Logo } from "./Logo";
import { Container, buttonClass, cx, focusRing } from "./ui";

function ThemeToggle() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((state) => state.theme.value);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => dispatch(toggle())}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={cx(
        "grid size-9 place-items-center rounded-full border border-line text-muted transition-colors hover:border-subtle/60 hover:text-fg",
        focusRing,
      )}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

const linkClass = cx("rounded-md text-sm font-medium text-muted transition-colors hover:text-fg", focusRing);

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-canvas/75 backdrop-blur-lg">
      <Container className="flex h-16 items-center gap-8">
        <Logo eager />
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-7">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={linkClass}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <DirectDownloadLink className={buttonClass({ size: "sm", className: "max-sm:hidden" })}>
            Download <DownloadIcon />
          </DirectDownloadLink>
          <button
            type="button"
            className={cx("grid size-9 place-items-center rounded-lg text-fg md:hidden", focusRing)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </Container>

      {menuOpen && (
        <nav id="mobile-menu" aria-label="Mobile" className="border-t border-line/60 md:hidden">
          <Container className="flex flex-col gap-1 py-3">
            {[...navLinks, { href: "#download", label: "Download" }].map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={cx("rounded-lg px-3 py-2.5 text-base font-medium text-fg hover:bg-raised", focusRing)}
              >
                {link.label}
              </a>
            ))}
          </Container>
        </nav>
      )}
    </header>
  );
}
