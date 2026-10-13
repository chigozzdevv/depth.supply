"use client";

import { useSyncExternalStore } from "react";

function snapshot(): "light" | "dark" {
  try {
    return localStorage.getItem("depth.docs.theme") === "light"
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("depth-docs-theme", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("depth-docs-theme", callback);
  };
}

export function useDocsTheme() {
  return useSyncExternalStore<"light" | "dark">(
    subscribe,
    snapshot,
    () => "dark",
  );
}
