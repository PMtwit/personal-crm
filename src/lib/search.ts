// Shared by the search query and its tests: lower-case, treat "ё" as "е",
// and split into words so "Петров Иван" finds "Иван Петров".
export function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replaceAll("ё", "е")
    .split(/\s+/)
    .filter(Boolean);
}

// Escape LIKE wildcards so "%" and "_" typed by the user match literally
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
