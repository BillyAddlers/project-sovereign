export { cn } from "cn";

/** Keep only digits and shape them into `HH:MM` (24-hour) as the user types. */
export function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
