import type { Place } from "../../shared/domain";
import { useI18n } from "../i18n";
import {
  sourcePhotoSchema,
  type SourcePhoto,
} from "../../shared/source-photos";

export function PlaceOrigin({
  place,
  linked = false,
  sourcePhoto,
}: {
  place?: Place;
  sourcePhoto?: SourcePhoto;
  linked?: boolean;
}) {
  const { language } = useI18n();
  const candidate = !place?.photo
    ? sourcePhoto || place?.sourcePhoto
    : undefined;
  const parsed = sourcePhotoSchema.safeParse(candidate);
  const photo = parsed.success ? parsed.data : undefined;
  if (!place?.officialSources?.length && !photo) return null;
  return (
    <span className="catalog-origin">
      {place?.officialSources?.length ? (
        <span>
          {language === "ko"
            ? "운영자 수집 자료 · 현지인 추천과 별도"
            : "Source-based listing · separate from local endorsements"}
        </span>
      ) : null}
      {linked &&
        place?.officialSources?.map((source) => (
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
      {photo && (
        <span className="source-photo-attribution">
          <span>
            {language === "ko"
              ? "공개 라이선스 사진 · "
              : "Licensed source photo · "}
          </span>
          <span>
            {photo.caption}
            {photo.capturedAt
              ? ` · ${language === "ko" ? "촬영" : "Taken"} ${photo.capturedAt.split(" ")[0]}`
              : ""}
          </span>{" "}
          <span>{photo.author} · </span>
          <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">
            {photo.license}
          </a>
          {" · "}
          <a
            href={photo.sourcePageUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {language === "ko" ? "사진 원문" : "Photo source"} · {photo.title}
          </a>
          {linked && (
            <span>
              {" "}
              · {photo.changes}
              {photo.priorChanges ? ` · ${photo.priorChanges}` : ""}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
