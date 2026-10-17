import { expect, it } from "vitest";
import { candidateSigner } from "../server/candidates";
const venue = {
  id: "provider-12",
  name: "식당",
  address: { road: "서울 테스트길 12" },
  location: { lat: 37.5, lng: 127 },
};
it("binds a selection to provider facts and rejects tampering and expiration", () => {
  let now = 1000;
  const signer = candidateSigner("test-signing-secret", () => now);
  const token = signer.issue(venue);
  expect(signer.verify(token)).toEqual(venue);
  const [data, signature] = token.split(".");
  expect(() =>
    signer.verify(
      `${Buffer.from(JSON.stringify({ venue: { ...venue, id: "forged" }, expires: 9999999 })).toString("base64url")}.${signature}`,
    ),
  ).toThrow();
  expect(() => signer.verify(`${data}.bad`)).toThrow();
  now += 600001;
  expect(() => signer.verify(token)).toThrow(/만료/);
});
