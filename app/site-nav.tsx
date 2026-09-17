"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Map" },
  { href: "/how-it-works", label: "How it works" },
];

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="site-nav">
      <Link href="/" className="site-nav-brand">
        WalkReach
        <span className="site-nav-tagline">
          Walking accessibility in Hamilton, NZ
        </span>
      </Link>
      <nav className="site-nav-links">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
        <a href="https://github.com/derekdiliu/walkreach">GitHub</a>
      </nav>
    </header>
  );
}
