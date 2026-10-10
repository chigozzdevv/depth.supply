"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Wordmark } from "@/components/ui/wordmark";
import { site } from "@/shared/config/site";

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

function hasScrolled() {
  return window.scrollY > 16;
}

function initialScroll() {
  return false;
}

export function Header() {
  const [open, setOpen] = useState(false);
  const scrolled = useSyncExternalStore(subscribe, hasScrolled, initialScroll);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  return (
    <header className="header" data-scrolled={scrolled}>
      <div className="shell header-inner">
        <Wordmark />
        <nav aria-label="Main navigation" className="header-nav">
          {site.navigation.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <a href="/demo/trade" className="header-cta">
          Run a Demo <span aria-hidden="true">↗</span>
        </a>
        <button
          ref={toggle}
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen(!open)}
          className="menu-toggle"
        >
          {open ? (
            <X size={20} aria-hidden="true" />
          ) : (
            <Menu size={20} aria-hidden="true" />
          )}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="mobile-nav"
        >
          {site.navigation.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </a>
          ))}
          <a
            href="/demo/trade"
            onClick={() => setOpen(false)}
            className="action"
          >
            Run a Demo <span aria-hidden="true">↗</span>
          </a>
        </nav>
      )}
    </header>
  );
}
