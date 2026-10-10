import Link from "next/link";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label="Depth home" className={`wordmark ${className}`}>
      depth
    </Link>
  );
}
