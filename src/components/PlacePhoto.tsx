import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { api } from "../api";
import { useI18n } from "../i18n";
import {
  sourcePhotoSchema,
  type SourcePhoto,
} from "../../shared/source-photos";

// Only persisted, reviewed contributor photographs may be public venue images.
// Missing/failed photographs stay empty; never substitute synthetic or unrelated imagery.
export function PlacePhoto({
  id,
  sourcePhoto,
  name,
  privatePreview = false,
  className = "place-photo",
}: {
  id?: string;
  sourcePhoto?: SourcePhoto;
  name: string;
  privatePreview?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
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
  }, [id, privatePreview, sourcePhoto?.assetPath]);
  const reviewedSource =
    !privatePreview && !id ? sourcePhotoSchema.safeParse(sourcePhoto) : null;
  const src = privatePreview
    ? privateUrl
    : id
      ? `/api/place-photos/${id}/image`
      : reviewedSource?.success
        ? reviewedSource.data.assetPath
        : "";
  return src && !failed ? (
    <img
      className={className}
      src={src}
      alt={reviewedSource?.success ? reviewedSource.data.caption : name}
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
