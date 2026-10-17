import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { en, ko } from "./locales/planner";
import { discoveryEn } from "./locales/discovery";
import { photosKo, photosEn } from "./locales/photos";
import { bookingKo, bookingEn } from "./locales/booking";
import { sharingKo, sharingEn } from "./locales/sharing";
export type Language = "ko" | "en";
type Translator = (
  key: string,
  vars?: Record<string, string | number>,
) => string;
const Context = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translator;
}>({ language: "ko", setLanguage: () => {}, t: (key) => key });
export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem("localroute.language");
      if (saved === "ko" || saved === "en") return saved;
    } catch {
      /* use browser preference */
    }
    return navigator.language.startsWith("ko") ? "ko" : "en";
  });
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem("localroute.language", language);
    } catch {
      /* locale still works */
    }
  }, [language]);
  const t = useCallback<Translator>(
    (key, vars) => {
      const messages = language === "ko" ? ko : en;
      let result =
        (language === "ko" ? sharingKo : sharingEn)[key] ||
        (language === "ko" ? bookingKo : bookingEn)[key] ||
        (language === "ko" ? photosKo : photosEn)[key] ||
        messages[key] ||
        (language === "en" ? discoveryEn[key] : undefined) ||
        key;
      for (const [name, value] of Object.entries(vars || {}))
        result = result.replaceAll(`{${name}}`, String(value));
      return result;
    },
    [language],
  );
  return (
    <Context.Provider value={{ language, setLanguage, t }}>
      {children}
    </Context.Provider>
  );
}
export function useI18n() {
  return useContext(Context);
}
export function LanguageSwitch() {
  const { language, setLanguage, t } = useI18n();
  return (
    <div
      className="language-switch"
      role="group"
      aria-label={t("common.language")}
    >
      <button
        aria-pressed={language === "ko"}
        onClick={() => setLanguage("ko")}
      >
        한국어
      </button>
      <button
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
    </div>
  );
}
