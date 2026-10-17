import type { Place } from "../../shared/domain";
import { useI18n } from "../i18n";

export function PlaceOrigin({
  place,
  linked = false,
}: {
  place: Place;
  linked?: boolean;
}) {
  const { language } = useI18n();
  if (!place.officialSources?.length) return null;
  return (
    <span className="catalog-origin">
      <span>
        {language === "ko"
          ? "운영자 수집 자료 · 현지인 추천과 별도"
          : "Source-based listing · separate from local endorsements"}
      </span>
      {linked &&
        place.officialSources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {language === "ko" ? "장소 정보 출처" : "Place information source"}{" "}
            ·{" "}
            {new Date(source.observedAt).toLocaleDateString(
              language === "ko" ? "ko-KR" : "en-GB",
              { timeZone: "Asia/Seoul" },
            )}
          </a>
        ))}
    </span>
  );
}
