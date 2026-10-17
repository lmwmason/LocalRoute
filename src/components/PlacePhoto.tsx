import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { api } from "../api";
import { useI18n } from "../i18n";

// Only persisted, reviewed contributor photographs may be public venue images.
// Missing/failed photographs stay empty; never substitute synthetic or unrelated imagery.
export function PlacePhoto({
  id,
  name,
  privatePreview = false,
  className = "place-photo",
}: {
  id?: string;
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
  }, [id, privatePreview]);
  const src = privatePreview
    ? privateUrl
    : id
      ? `/api/place-photos/${id}/image`
      : "";
  return src && !failed ? (
    <img
      className={className}
      src={src}
      alt={name}
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
