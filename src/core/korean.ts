const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;

/** 완성형 한글의 종성 개수. (코드 − 0xAC00) % 28 이 0이면 받침이 없다. */
const FINAL_CONSONANT_COUNT = 28;

/** 마지막 글자에 받침이 있는지. 한글이 아니면 없는 것으로 본다. */
function endsWithFinalConsonant(word: string): boolean {
  const code = word.charCodeAt(word.length - 1);
  if (Number.isNaN(code) || code < HANGUL_FIRST || code > HANGUL_LAST) return false;
  return (code - HANGUL_FIRST) % FINAL_CONSONANT_COUNT !== 0;
}

/** 주격 조사를 붙인다. "바닥폭" → "바닥폭은", "가로" → "가로는". */
export function withTopicParticle(word: string): string {
  return `${word}${endsWithFinalConsonant(word) ? '은' : '는'}`;
}

/** 목적격 조사를 붙인다. "바닥폭" → "바닥폭을", "가로" → "가로를". */
export function withObjectParticle(word: string): string {
  return `${word}${endsWithFinalConsonant(word) ? '을' : '를'}`;
}
