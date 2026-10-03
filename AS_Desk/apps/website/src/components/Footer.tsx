import { navLinks } from "../content";
import { Logo } from "./Logo";
import { Container, cx, focusRing } from "./ui";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <Container className="flex flex-col gap-8 py-10 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <Logo size="sm" />
          <p className="text-sm text-subtle">Free remote desktop for Windows and Mac.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            {[...navLinks, { href: "#downloads", label: "Download" }, { href: "#top", label: "Back to top ↑" }].map(
              (link) => (
                <li key={link.href}>
                  <a href={link.href} className={cx("rounded-md transition-colors hover:text-fg", focusRing)}>
                    {link.label}
                  </a>
                </li>
              ),
            )}
          </ul>
        </nav>
      </Container>
      <Container>
        <div className="flex flex-col gap-2 border-t border-line/60 py-6 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} ASDesk. Free to download and use.</p>
          <p>
            Designed and developed by{" "}
            <a
              href="https://www.raione.net"
              target="_blank"
              rel="noopener noreferrer"
              className={cx("rounded-sm font-display font-semibold text-fg underline-offset-2 hover:underline", focusRing)}
            >
              r<span className="text-accent">AI</span>one
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        </div>
      </Container>
    </footer>
  );
}
