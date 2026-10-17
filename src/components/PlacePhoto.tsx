import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { api } from "../api";
import { useI18n } from "../i18n";
import {
  displayMediaSchema,
  type DisplayMedia,
} from "../../shared/display-media";
import "./place-photo.css";
import {
  sourcePhotoSchema,
  type SourcePhoto,
} from "../../shared/source-photos";

// All public media comes from the canonical database. Illustrations are visibly
// separate from real photos and can never satisfy a contributor photo upload.
export function PlacePhoto({
  id,
  sourcePhoto,
  displayMedia,
  name,
  privatePreview = false,
  className = "place-photo",
}: {
  id?: string;
  sourcePhoto?: SourcePhoto;
  displayMedia?: DisplayMedia;
  name: string;
  privatePreview?: boolean;
  className?: string;
}) {
  const { t, language } = useI18n();
  const [privateUrl, setPrivateUrl] = useState(""),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false,
      url = "";
    setFailed(false);
    setPrivateUrl("");
    if (id && privatePreview)
      api
        .photoBlob(id)
        .then((blob) => {
          if (!cancelled) {
            url = URL.createObjectURL(blob);
            setPrivateUrl(url);
          }
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, privatePreview, sourcePhoto?.assetPath, displayMedia?.assetPath]);
  const reviewedSource =
    !privatePreview && !id ? sourcePhotoSchema.safeParse(sourcePhoto) : null;
  const parsedMedia =
    !id && !sourcePhoto && !privatePreview
      ? displayMediaSchema.safeParse(displayMedia)
      : null;
  const media = parsedMedia?.success ? parsedMedia.data : undefined;
  const illustrationLabel =
    language === "ko"
      ? "AI 일러스트 · 실제 매장 사진 아님"
      : "AI illustration · Not a venue photo";
  const src = privatePreview
    ? privateUrl
    : id
      ? `/api/place-photos/${id}/image`
      : reviewedSource?.success
        ? reviewedSource.data.assetPath
        : media?.assetPath || "";
  if (media?.assetType === "ai_illustration" && !failed)
    return (
      <span className={`${className} place-illustration`}>
        <img
          src={media.assetPath}
          alt={illustrationLabel}
          loading="lazy"
          onError={() => setFailed(true)}
        />
        <span className="place-illustration-label">{illustrationLabel}</span>
      </span>
    );
  return src && !failed ? (
    <img
      className={className}
      src={src}
      alt={
        reviewedSource?.success
          ? reviewedSource.data.caption
          : media?.alt || name
      }
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      className={`${className} photo-empty`}
      role="img"
      aria-label={t(id ? "photos.error.load" : "photos.missing")}
    >
      <ImageOff size={22} />
    </span>
  );
}
