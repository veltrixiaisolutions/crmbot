import { useState, useEffect } from "react";

export interface TimezoneOption {
  value: string;
  label: string;
  short: string;
  region: "India" | "Canada";
  flag: string;
}

// Only India and Toronto as requested
export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { 
    value: "Asia/Kolkata", 
    label: "India Time (IST)", 
    short: "IST", 
    region: "India", 
    flag: "🇮🇳" 
  },
  { 
    value: "America/Toronto", 
    label: "Toronto Time (EST/EDT)", 
    short: "Toronto", 
    region: "Canada", 
    flag: "🇨🇦" 
  },
];

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const TIMEZONE_STORAGE_KEY = "veltrix_selected_timezone";

export function getTimezoneOption(tz?: string | null): TimezoneOption {
  if (!tz) return TIMEZONE_OPTIONS[0]; // Default India Standard Time
  const found = TIMEZONE_OPTIONS.find((t) => t.value === tz);
  if (found) return found;

  // Toronto / North American Eastern aliases (New_York, EST, EDT, America)
  if (
    tz.includes("Toronto") ||
    tz.includes("New_York") ||
    tz.includes("Eastern") ||
    tz.includes("EDT") ||
    tz.includes("EST") ||
    tz.includes("America") ||
    tz.includes("Canada")
  ) {
    return TIMEZONE_OPTIONS[1];
  }

  // India / Kolkata aliases
  if (
    tz.includes("Kolkata") ||
    tz.includes("Calcutta") ||
    tz.includes("IST") ||
    tz.includes("India") ||
    tz.includes("Asia")
  ) {
    return TIMEZONE_OPTIONS[0];
  }

  return TIMEZONE_OPTIONS[0];
}

export function getSelectedTimezone(): string {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(TIMEZONE_STORAGE_KEY);
      if (saved) {
        return getTimezoneOption(saved).value;
      }
    } catch {}
  }
  return DEFAULT_TIMEZONE;
}

export function setSelectedTimezone(tz: string): void {
  const validTz = getTimezoneOption(tz).value;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(TIMEZONE_STORAGE_KEY, validTz);
      window.dispatchEvent(new CustomEvent("veltrix-timezone-change", { detail: validTz }));
    } catch {}
  }
}

export function useSelectedTimezone(initialTz?: string): [string, (tz: string) => void] {
  const [timezone, setTimezoneState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(TIMEZONE_STORAGE_KEY);
        if (saved) return getTimezoneOption(saved).value;
      } catch {}
    }
    return getTimezoneOption(initialTz).value;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleTzChange = (e: any) => {
      const newTz = e?.detail || getSelectedTimezone();
      setTimezoneState(getTimezoneOption(newTz).value);
    };

    window.addEventListener("veltrix-timezone-change", handleTzChange);
    window.addEventListener("storage", handleTzChange);
    return () => {
      window.removeEventListener("veltrix-timezone-change", handleTzChange);
      window.removeEventListener("storage", handleTzChange);
    };
  }, []);

  const changeTimezone = (newTz: string) => {
    const validTz = getTimezoneOption(newTz).value;
    setTimezoneState(validTz);
    setSelectedTimezone(validTz);
  };

  return [timezone, changeTimezone];
}

/**
 * Robustly parses date inputs (strings, numbers, Dates).
 * If the input is an ISO string without timezone indicator (like "2026-10-14T18:42:00" from naive DB queries),
 * appends "Z" to guarantee it is interpreted as UTC.
 */
export function parseUtcDate(dateInput: string | number | Date | null | undefined): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
  if (typeof dateInput === "number") {
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateInput === "string") {
    let s = dateInput.trim();
    if (!s) return null;
    // If it's an ISO format without timezone indicator (no 'Z' and no +/- offset at end)
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) {
      s = s.replace(" ", "T") + "Z";
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  try {
    const d = new Date(dateInput as any);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function formatInTimezone(
  dateInput: string | number | Date | null | undefined,
  timeZone?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateInput) return "";
  const d = parseUtcDate(dateInput);
  if (!d) return "";

  const tz = getTimezoneOption(timeZone || getSelectedTimezone()).value;

  try {
    const defaultOptions: Intl.DateTimeFormatOptions = {
      timeZone: tz,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
      ...options,
    };

    return new Intl.DateTimeFormat("en-US", defaultOptions).format(d);
  } catch (err) {
    return String(dateInput);
  }
}

export function formatTimeOnly(
  dateInput: string | number | Date | null | undefined,
  timeZone?: string
): string {
  if (!dateInput) return "";
  const d = parseUtcDate(dateInput);
  if (!d) return "";

  const tz = getTimezoneOption(timeZone || getSelectedTimezone()).value;

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(d);
  } catch (err) {
    return "";
  }
}

export function getCurrentTimeInTimezone(timeZone?: string): string {
  const tz = getTimezoneOption(timeZone || getSelectedTimezone()).value;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(new Date());
  } catch (err) {
    return "";
  }
}
