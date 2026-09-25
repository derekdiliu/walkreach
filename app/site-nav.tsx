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
        {/* A pin at the end of a dotted walk. */}
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" className="site-nav-mark">
          <path
            d="M3 21 C 7 21, 9 17.5, 13 17.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeDasharray="0.1 3.6"
          />
          <path
            d="M16 2.5a5.5 5.5 0 0 1 5.5 5.5c0 4-5.5 9.5-5.5 9.5s-5.5-5.5-5.5-9.5A5.5 5.5 0 0 1 16 2.5z"
            fill="currentColor"
          />
          <circle cx="16" cy="8" r="2" fill="#fff" />
        </svg>
        <span className="site-nav-name">
          Walk<span className="site-nav-accent">Reach</span>
        </span>
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
