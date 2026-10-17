import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAccountExamplePlans, accountExampleDates } from "../scripts/build-account-example-plans";
import { euljiroExample } from "../shared/euljiro-example";
import type { Place } from "../shared/domain";
import type { Destination } from "../shared/destinations";
import { ItineraryEditor } from "../src/planner/ItineraryEditor";

const destination: Destination = {
  id: "kakao:region:%EC%84%9C%EC%9A%B8%20%EC%A2%85%EB%A1%9C%EA%B5%AC",
  label: "서울 종로구", country: "KR", level: "district", region1: "서울", region2: "종로구", region3: "",
  lat: 37.5747729531135, lng: 126.97961447609,
  source: {provider:"kakao",endpoint:"https://dapi.kakao.com/v2/local/search/address.json",addressType:"REGION",observedAt:"2026-10-17T06:03:44.545Z",verification:"provider",coordinateMeaning:"region_representative"},
};
// Synthetic in-memory media fixtures; never sent to a provider or inserted remotely.
function places(): Place[] {
  return euljiroExample.stops.map((stop,index) => ({
    id: stop.canonicalPlaceId, name: stop.name, address: stop.address, lat: stop.lat, lng: stop.lng,
    kind: stop.kind, category: ["한식","카페","역사공원"][index], tags: [],
    rating: null, reviewCount: 0, source: "localroute", endorsements: [],
    officialSources: stop.sources.map(source => ({url:source.url,observedAt:euljiroExample.checkedAt})),
    photo: {id:"00000000-0000-4000-8000-000000000001",width:800,height:600,source:"contributor",review:"approved"},
    externalIds: index === 1 ? [{provider:"heyyumi",externalId:"1185547279",observedAt:euljiroExample.checkedAt,possiblyClosed:false}] : [],
  }));
}
describe("authorized operator booking examples", () => {
  it("builds four separate stable zero-LP plans with exact canonical stops and unknown-hours warnings", () => {
    const plans = buildAccountExamplePlans(places(),destination);
    expect(plans).toHaveLength(4);
    expect(new Set(plans.map(plan=>plan.id)).size).toBe(4);
    expect(buildAccountExamplePlans(places(),destination).map(plan=>plan.id)).toEqual(plans.map(plan=>plan.id));
    for(const [index,plan]of plans.entries()) {
      expect(plan).toMatchObject({provenance:"operator_example",cost:0,revision:1,model:"operator-curated-v1",input:{startDate:accountExampleDates[index],endDate:accountExampleDates[index]}});
      expect(plan.evaluation.valid).toBe(true);
      expect(plan.evaluation.warnings.map(warning=>warning.code)).toContain("HOURS_UNKNOWN");
      expect(plan.evaluation.warnings.map(warning=>warning.code)).toContain("ROUTE_TIME_UNAVAILABLE");
      expect(plan.schedule.days[0].stops.map(({candidateId,start,end})=>({candidateId,start,end}))).toEqual(euljiroExample.stops.map(stop=>({candidateId:stop.canonicalPlaceId,start:stop.start,end:stop.end})));
      expect(plan.catalog[1].externalIds?.[0].externalId).toBe("1185547279");
      expect(plan).not.toHaveProperty("userId");
      expect(plan).not.toHaveProperty("source_request_id");
    }
  });
  it("fails without canonical media, source identity or provider mapping", () => {
    const noMedia=places();delete noMedia[0].photo;
    expect(()=>buildAccountExamplePlans(noMedia,destination)).toThrow("place/media missing");
    const noSource=places();noSource[0].officialSources=[];
    expect(()=>buildAccountExamplePlans(noSource,destination)).toThrow("place/media missing");
    const noProvider=places();noProvider[1].externalIds=[];
    expect(()=>buildAccountExamplePlans(noProvider,destination)).toThrow("provider identity missing");
    expect(()=>buildAccountExamplePlans(places().slice(1),destination)).toThrow("place/media missing");
  });
  it("does not pass closed venues through schedule validation", () => {
    const closed=places();closed[0].hours={"2026-10-20":[]};
    expect(()=>buildAccountExamplePlans(closed,destination)).toThrow("CLOSED_VENUE");
  });
  it("labels the operator provenance and unconfirmed reservation status in the editor", () => {
    const [plan]=buildAccountExamplePlans(places(),destination);
    const html=renderToStaticMarkup(createElement(ItineraryEditor,{itinerary:plan,onSaved:()=>{},onRegenerate:()=>{}}));
    expect(html).toContain("운영자 예약 시연 일정");
    expect(html).toContain("0 LP");
    expect(html).toContain("예약 확정 아님");
  });
});
