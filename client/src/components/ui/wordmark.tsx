import Link from "next/link";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/#top"
      aria-label="Depth home"
      className={`wordmark ${className}`}
    >
      depth
    </Link>
  );
}
