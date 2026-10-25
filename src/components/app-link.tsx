"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { linkPathname, transitionFor } from "@/lib/nav";

/**
 * A next/link that carries its page transition: forward or back along the
 * nav, or a crossfade on the same page (see lib/nav.ts). Everything else is
 * passed straight through; an explicit transitionTypes wins.
 */
export function AppLink({ transitionTypes, ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const to = props.target || props.download ? undefined : linkPathname(props.href, pathname);
  return <Link {...props} transitionTypes={transitionTypes ?? (to ? [transitionFor(pathname, to)] : undefined)} />;
}

/** router.push with the same page transitions as AppLink, for navigation that happens in code. */
export function useAppRouter() {
  const router = useRouter();
  const pathname = usePathname();
  return {
    push(href: string) {
      const to = linkPathname(href, pathname);
      router.push(href, to ? { transitionTypes: [transitionFor(pathname, to)] } : undefined);
    },
  };
}
