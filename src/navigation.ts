export const panelPaths = {
  contribute: "/contribute",
  login: "/login",
  profile: "/account",
  bookingSetup: "/account/booking",
  feedback: "/feedback",
  correction: "/corrections",
  report: "/reports",
} as const;
export type Panel = keyof typeof panelPaths | null;
export function routeTab(path: string): "plan" | "explore" | "trip" {
  if (path.startsWith("/saved")) return "trip";
  if (
    path === "/" ||
    path.startsWith("/plan") ||
    path.startsWith("/itineraries")
  )
    return "plan";
  return "explore";
}
export function readAppRoute(path: string, search: string, state: unknown) {
  const data =
    state && typeof state === "object"
      ? (state as { backgroundPath?: unknown; overlay?: unknown })
      : {};
  const background =
    typeof data.backgroundPath === "string" &&
    /^\/(?!\/)/.test(data.backgroundPath)
      ? data.backgroundPath
      : "/discover";
  const currentPanel =
    (Object.entries(panelPaths).find(
      ([, value]) => value === path,
    )?.[0] as Panel) || null;
  const loginOverlay =
    currentPanel === "login" &&
    background.split("?")[0] === panelPaths.contribute;
  const panel: Panel = loginOverlay ? "contribute" : currentPanel;
  const tab =
    path === "/" && new URLSearchParams(search).get("view") === "explore"
      ? "explore"
      : routeTab(currentPanel ? background : path);
  const placeId = path.startsWith("/places/")
    ? path.slice("/places/".length)
    : null;
  const targetId =
    new URLSearchParams(search).get("place") ||
    (loginOverlay
      ? new URLSearchParams(background.split("?")[1] || "").get("place")
      : null);
  return {
    tab,
    panel,
    placeId,
    targetId,
    loginOverlay,
    background,
    overlay: data.overlay === true,
    path,
    search,
  };
}
