import type { Place } from "../../shared/domain";
import { PlacePhoto } from "../components/PlacePhoto";
import { PlaceOrigin } from "../components/PlaceOrigin";
import { useI18n } from "../i18n";
import "./euljiro-images.css";

/** The example uses exactly the same canonical DB media as discovery/details. */
export function EuljiroStopImage({ place }: { place?: Place }) {
  const { language } = useI18n();
  if (!place)
    return (
      <p className="example-photo-empty" role="status">
        {language === "ko"
          ? "장소 이미지를 확인하고 있어요."
          : "Checking the place image."}
      </p>
    );
  return (
    <figure className="example-stop-image">
      <PlacePhoto
        id={place.photo?.id}
        sourcePhoto={place.sourcePhoto}
        displayMedia={place.displayMedia}
        name={place.name}
      />
      <figcaption>
        <PlaceOrigin place={place} linked />
      </figcaption>
    </figure>
  );
}
