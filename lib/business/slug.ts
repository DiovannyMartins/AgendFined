const SLUG_MAX_LENGTH = 50;

// Turns the business name into a slug suggestion during setup (#149):
// "Estúdio Beta Teste" → "estudio-beta-teste". The owner can still edit it;
// businessFields.slug remains the only rule for what is accepted.
export function suggestSlug(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= SLUG_MAX_LENGTH) return slug;
  return slug.slice(0, SLUG_MAX_LENGTH).replace(/-+$/, "");
}
