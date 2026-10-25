"use client";

import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

/**
 * A row of tabs with a lit pill that glides to the selected one (Base UI's
 * indicator, styled in globals.css). The panel below is the caller's: give it
 * key={value} and className="reveal-fast" so it pops in on every switch.
 */
export function TabBar<T extends string>({
  value,
  onValueChange,
  items,
  label,
  className = "",
}: {
  value: T;
  onValueChange: (value: T) => void;
  items: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <Tabs.Root value={value} onValueChange={(next) => onValueChange(next as T)}>
      <Tabs.List
        aria-label={label}
        className={`relative isolate flex w-fit max-w-full gap-1 rounded-full border border-line bg-surface/80 p-1 ${className}`}
      >
        {items.map((item) => (
          <Tabs.Tab key={item.value} value={item.value} className="tab">
            {item.label}
          </Tabs.Tab>
        ))}
        <Tabs.Indicator className="tabs-indicator" />
      </Tabs.List>
    </Tabs.Root>
  );
}
