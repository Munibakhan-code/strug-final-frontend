/** Translate a work_category row by stable slug; falls back to API name. */
export function workCategoryLabel(t, cat) {
  if (!cat) return "";
  const slug = cat.slug;
  if (!slug) return cat.name ?? "";
  const key = `ondemand.categories.${slug}`;
  const translated = t(key);
  return translated === key ? (cat.name ?? slug) : translated;
}
