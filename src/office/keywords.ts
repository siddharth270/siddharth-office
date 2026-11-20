/**
 * Keyword extraction for the profile-search fallback (see profile_search in
 * src/ai/office-tools.ts). Pure, so it is unit-tested.
 */

const STOPWORDS = new Set(
  'a an and are as at be but by can did do does for from had has have he her him his how i in is it me my of on or she so tell than that the their them they this to was what when where which who why will with you your about'.split(' '),
)

/** Content words for keyword fallback, plus crude singular/stem variants. */
export function keywords(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]+/g, ' ')
    .split(' ')
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  const out = new Set<string>()
  for (const w of words) {
    out.add(w)
    if (w.length > 4 && w.endsWith('s')) out.add(w.slice(0, -1))
    if (w.length > 5 && w.endsWith('ing')) out.add(w.slice(0, -3))
    if (w === 'study' || w === 'studied') out.add('education')
    if (w === 'play' || w === 'plays') out.add('sports')
    if (w === 'work' || w === 'worked' || w === 'job' || w === 'jobs') out.add('experience')
    if (w === 'papers' || w === 'paper' || w === 'published') out.add('publications')
  }
  return [...out].slice(0, 8)
}
