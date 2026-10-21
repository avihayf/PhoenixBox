/**
 * Join class names, skipping falsy values.
 *
 * This used to be clsx + tailwind-merge — about 8% of the popup bundle — for
 * one component that no caller ever passes a conflicting className to, so
 * there is nothing to merge.
 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(" ");
}
