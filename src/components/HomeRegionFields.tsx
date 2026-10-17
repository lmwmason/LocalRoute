import {
  type Locality,
  localityLabel,
  suggestedScope,
} from "../../shared/locality";
import { useI18n } from "../i18n";
export function HomeRegionFields({
  value,
  onChange,
}: {
  value: Locality;
  onChange: (value: Locality) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="home-region-fields">
      <label>
        {t("profile.city")}
        <input
          autoComplete="address-level2"
          value={value.homeCity}
          minLength={2}
          maxLength={80}
          required
          onChange={(e) => onChange({ ...value, homeCity: e.target.value })}
          placeholder={t("profile.cityPlaceholder")}
        />
      </label>
      <label>
        {t("profile.area")}
        <input
          value={value.homeArea}
          maxLength={80}
          onChange={(e) => onChange({ ...value, homeArea: e.target.value })}
          placeholder={t("profile.areaPlaceholder")}
        />
      </label>
      <label>
        {t("profile.scope")}
        <select
          value={value.localityScope}
          onChange={(e) =>
            onChange({
              ...value,
              localityScope: e.target.value as Locality["localityScope"],
            })
          }
        >
          <option value="auto">{t("profile.scopeAuto")}</option>
          <option value="city">{t("profile.scopeCity")}</option>
          <option value="area">{t("profile.scopeArea")}</option>
        </select>
      </label>
      {value.homeCity.trim().length >= 2 && (
        <p className="notice-box">
          {t("profile.scopePreview", {
            area: localityLabel(value),
            scope: t(
              suggestedScope(value) === "city"
                ? "profile.scopeCity"
                : "profile.scopeArea",
            ),
          })}
        </p>
      )}
      <p className="fine-print">{t("profile.scopeHelp")}</p>
    </div>
  );
}
