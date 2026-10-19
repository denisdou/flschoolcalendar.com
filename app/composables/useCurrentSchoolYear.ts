/**
 * Returns the site-wide school year calculated at build time in Central Time.
 * The shared resolver rolls to the next school year on July 1.
 */
export function useCurrentSchoolYear(): string {
  return String(useRuntimeConfig().public.currentSchoolYear)
}
