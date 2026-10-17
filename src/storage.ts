export function readSaved(): string[] {
  try {
    const v: unknown = JSON.parse(
      localStorage.getItem("localroute.saved.v1") || "[]",
    );
    return Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === "string"))].slice(
          0,
          100,
        )
      : [];
  } catch {
    return [];
  }
}
export function writeSaved(ids: string[]) {
  try {
    localStorage.setItem("localroute.saved.v1", JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}
