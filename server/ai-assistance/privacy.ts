// Deliberately conservative patterns; this is not a claim to detect all PII.
const privatePatterns = () => [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /(?:\+?\d[\d ()-]{7,}\d)/g,
  /https?:\/\/\S+/gi,
  /(?:Bearer\s+\S+|AIza[\w-]+|sb_secret_[\w-]+|sk-[\w-]+)/gi,
];
export function redactText(value: string): string {
  return privatePatterns().reduce(
    (text, pattern) => text.replace(pattern, "[REDACTED]"),
    value,
  );
}
export function hasPrivateText(value: unknown): boolean {
  return typeof value === "string"
    ? redactText(value) !== value
    : Array.isArray(value)
      ? value.some(hasPrivateText)
      : value !== null && typeof value === "object"
        ? Object.values(value).some(hasPrivateText)
        : false;
}
export const instructionLike = (value: string) =>
  /ignore\s+(?:all|previous|prior)|system\s*(?:prompt|instruction)|<\/?(?:system|script)|자동\s*(?:게시|차단|지급)|지시.{0,8}무시|명령.{0,8}무시|(?:publish|ban|award|pay)\s+(?:automatically|points|LP)|(?:이전|위의).{0,8}무시/i.test(
    value,
  );
