import { useI18n } from "../i18n";
import {
  validateTransportGap,
  type TransportLegResult,
  type TransportReason,
} from "../../shared/transport";
import "./transport.css";

export type TransportLegProps = {
  leg?: TransportLegResult | null;
  loading?: boolean;
  language?: "ko" | "en";
  availableSeconds?: number;
  bufferSeconds?: number;
  onRetry?: () => void;
};
const reasons: Record<TransportReason, [string, string]> = {
  disabled: [
    "경로 조회가 아직 활성화되지 않았어요.",
    "Route lookup is not enabled.",
  ],
  unsupported_mode: [
    "이 이동 수단의 경로를 확인할 수 없어요.",
    "Routes for this travel mode are unverified.",
  ],
  invalid_request: [
    "출발지와 도착지를 확인해 주세요.",
    "Check the origin and destination.",
  ],
  unauthorized: [
    "경로 제공자 연결을 확인해야 해요.",
    "The route provider connection needs attention.",
  ],
  rate_limited: [
    "조회가 잠시 제한되었어요. 나중에 다시 확인해 주세요.",
    "Route lookup is limited. Please try again later.",
  ],
  budget_exceeded: [
    "경로 조회 한도에 도달했어요.",
    "The route lookup budget has been reached.",
  ],
  provider_unavailable: [
    "경로 제공자에 연결할 수 없어요.",
    "The route provider is unavailable.",
  ],
  timeout: ["경로 조회 시간이 초과됐어요.", "Route lookup timed out."],
  no_results: ["확인할 수 있는 경로가 없어요.", "No route could be verified."],
  invalid_response: [
    "경로 정보를 확인할 수 없어요.",
    "The route information could not be verified.",
  ],
};

export function TransportLeg({
  leg,
  loading = false,
  language,
  availableSeconds,
  bufferSeconds = 0,
  onRetry,
}: TransportLegProps) {
  const context = useI18n();
  const lang = language ?? context.language;
  const ko = lang === "ko";
  const text = (k: string, e: string) => (ko ? k : e);
  const gap =
    leg && availableSeconds !== undefined
      ? validateTransportGap(leg, availableSeconds, bufferSeconds)
      : null;
  const labels = {
    car: text("자동차", "Car"),
    transit: text("대중교통", "Public transit"),
    walking: text("도보", "Walking"),
    wheelchair: text("휠체어", "Wheelchair"),
    bus: text("버스", "Bus"),
    subway: text("지하철", "Subway"),
  };
  const duration = (seconds: number) =>
    `${Math.ceil(seconds / 60)}${text("분", " min")}`;
  const timestamp = leg ? new Date(leg.source.checkedAt) : null;
  const checkedAt =
    timestamp && Number.isFinite(timestamp.getTime())
      ? new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", {
          timeZone: "Asia/Seoul",
          dateStyle: "short",
          timeStyle: "short",
        }).format(timestamp)
      : null;
  return (
    <section
      className="transport-leg"
      aria-label={text("이동 구간", "Transport leg")}
      aria-busy={loading}
      lang={lang}
    >
      <div role="status" aria-live="polite">
        <strong>
          {leg ? labels[leg.request.mode] : text("이동 구간", "Transport leg")}
        </strong>
        {loading ? (
          <p>{text("경로를 확인하고 있어요…", "Checking the route…")}</p>
        ) : leg?.status === "estimated" ? (
          <>
            <p>
              {text("제공자 예상", "Provider estimate")}:{" "}
              {duration(leg.durationSeconds)} ·{" "}
              {leg.distanceMeters.toLocaleString(ko ? "ko-KR" : "en-US")} m
            </p>
            {leg.transfers !== null && (
              <p>
                {text("환승", "Transfers")}: {leg.transfers}
              </p>
            )}
            {leg.walking && (
              <p>
                {text("도보 구간", "Walking sections")}:{" "}
                {leg.walking.distanceMeters} m ·{" "}
                {duration(leg.walking.durationSeconds)}
              </p>
            )}
            {leg.fare && (
              <p>
                {leg.fare.kind === "toll"
                  ? text(
                      "예상 통행료 (총 이동 비용 아님)",
                      "Estimated toll (not total trip cost)",
                    )
                  : text("제공자 예상 요금", "Provider fare estimate")}
                :{" "}
                {leg.fare.value !== null
                  ? `${leg.fare.value} KRW`
                  : `${leg.fare.min ?? "?"}–${leg.fare.max ?? "?"} KRW`}
              </p>
            )}
            <p>
              {text(
                "조회 시점 기준 예상이에요. 여행일의 교통·운행과 도착 시각은 보장되지 않아요.",
                "Estimated at lookup time. Traffic, services on your travel date and arrival time are not guaranteed.",
              )}
            </p>
          </>
        ) : (
          <p>
            {text("경로 미확인", "Route unverified")}.{" "}
            {leg?.status === "unverified"
              ? reasons[leg.reason][ko ? 0 : 1]
              : text("경로를 조회해 주세요.", "Please check the route.")}
          </p>
        )}
      </div>
      {!loading && gap?.status === "exceeds_gap" && (
        <p role="alert">
          {text(
            "예상 이동 시간이 일정 간격을 초과해요. 다음 일정을 조정해 주세요.",
            "Estimated travel exceeds the schedule gap. Adjust the next stop.",
          )}{" "}
          (+{duration(gap.excessSeconds!)})
        </p>
      )}
      {!loading && gap?.status === "invalid_gap" && (
        <p role="alert">
          {text("일정 간격을 확인해 주세요.", "Check the schedule gap.")}
        </p>
      )}
      <p>
        {text(
          "휠체어 접근성과 무장애 이동 경로는 미확인이에요.",
          "Wheelchair access and step-free routes are unverified.",
        )}
      </p>
      {leg && (
        <small>
          {text("출처", "Source")}:{" "}
          {leg.source.provider === "kakao_mobility"
            ? "Kakao Mobility"
            : leg.source.provider === "kakao_maps"
              ? "Kakao Maps"
              : text("없음", "None")}{" "}
          · {text("조회 시각", "Checked")}:{" "}
          {checkedAt ?? text("미확인", "Unknown")} (Asia/Seoul)
          {!leg.source.attempted &&
            ` · ${text("제공자 조회 안 함", "Provider not queried")}`}
        </small>
      )}
      {!loading && leg?.status === "estimated" && leg.steps.length > 0 && (
        <details>
          <summary>{text("안내 단계 보기", "Show route steps")}</summary>
          {!ko && <p>Provider directions and place names may be in Korean.</p>}
          <ol>
            {leg.steps.map((step, index) => (
              <li key={index}>
                <strong>{labels[step.mode]}</strong> · {step.guidance} ·{" "}
                {step.distanceMeters} m · {duration(step.durationSeconds)}
                {step.vehicles.length > 0 && (
                  <p>
                    {step.vehicles.map((v) => `${v.type} ${v.name}`).join(", ")}
                  </p>
                )}
                {step.stops.length > 0 && <p>{step.stops.join(" → ")}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
      {!loading && leg?.status !== "estimated" && onRetry && (
        <button type="button" onClick={onRetry}>
          {text("경로 다시 확인", "Check route again")}
        </button>
      )}
    </section>
  );
}
