import type { Place } from "../../shared/domain";
import {
  displayMediaSchema,
  type DisplayMedia,
} from "../../shared/display-media";
import { useI18n } from "../i18n";
import "./place-origin.css";
import {
  sourcePhotoSchema,
  sourcePhotoLicenses,
  type SourcePhoto,
} from "../../shared/source-photos";

export function PlaceOrigin({
  place,
  linked = false,
  sourcePhoto,
  displayMedia,
}: {
  place?: Place;
  sourcePhoto?: SourcePhoto;
  displayMedia?: DisplayMedia;
  linked?: boolean;
}) {
  const { language } = useI18n();
  const candidate = !place?.photo
    ? sourcePhoto || place?.sourcePhoto
    : undefined;
  const parsed = sourcePhotoSchema.safeParse(candidate);
  const photo = parsed.success ? parsed.data : undefined;
  const parsedMedia =
    !place?.photo && !photo
      ? displayMediaSchema.safeParse(displayMedia || place?.displayMedia)
      : null;
  const media = parsedMedia?.success ? parsedMedia.data : undefined;
  if (!place?.officialSources?.length && !photo && !media) return null;
  return (
    <div
      className="catalog-origin"
      aria-label={
        language === "ko" ? "장소와 사진 출처" : "Place and photo credits"
      }
    >
      {place?.officialSources?.length ? (
        <div className="catalog-origin-label">
          <span>
            {language === "ko" ? "운영자 수집 자료" : "Source-based listing"}
          </span>
          <span>
            {language === "ko"
              ? "현지인 추천과 별도"
              : "Separate from local endorsements"}
          </span>
        </div>
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
        <div className="source-photo-attribution">
          <div className="source-photo-credit">
            <span>
              {language === "ko" ? "사진" : "Photo"}: {photo.author}
            </span>
            <a
              href={photo.licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {photo.license}
            </a>
            <a
              href={photo.sourcePageUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {language === "ko" ? "사진 원문" : "Photo source"}
            </a>
          </div>
          <details className="source-photo-details">
            <summary>
              {language === "ko" ? "사진 설명·촬영 정보" : "Photo details"}
            </summary>
            <div>
              <p>{photo.caption}</p>
              {photo.capturedAt && (
                <p>
                  {language === "ko" ? "촬영일" : "Taken"}:{" "}
                  {photo.capturedAt.split(" ")[0]}
                </p>
              )}
              <p>
                {language === "ko" ? "원제" : "Original title"}: {photo.title}
              </p>
              <p>
                {photo.changes}
                {photo.priorChanges ? ` · ${photo.priorChanges}` : ""}
              </p>
            </div>
          </details>
        </div>
      )}
      {media && (
        <div className="source-photo-attribution">
          <span>{media.credit} · </span>
          {Object.hasOwn(sourcePhotoLicenses, media.licenseLabel) ? (
            <a
              href={
                sourcePhotoLicenses[
                  media.licenseLabel as keyof typeof sourcePhotoLicenses
                ]
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              {media.licenseLabel}
            </a>
          ) : (
            <span>{media.licenseLabel}</span>
          )}
          <a href={media.sourceUrl} target="_blank" rel="noopener noreferrer">
            {language === "ko" ? "이미지 출처" : "Image source"}
          </a>
          {linked && <span>{media.changes}</span>}
        </div>
      )}
    </div>
  );
}
