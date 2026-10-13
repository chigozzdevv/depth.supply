import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";
import { site } from "@/shared/config/site";

export function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer-callout">
        <h2>
          Build the next
          <span>trading experience.</span>
        </h2>
        <Link href="/docs" className="action">
          Build with Depth <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <div className="shell footer-bottom">
        <Wordmark className="footer-wordmark" />
        <div className="footer-meta">
          <nav aria-label="Footer navigation">
            {site.navigation.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
            <a href="#questions">FAQ</a>
          </nav>
          <p>© {new Date().getFullYear()} Depth</p>
        </div>
      </div>
    </footer>
  );
}
