import { afterEach, describe, expect, it, vi } from "vitest";
import { createBookingTokenSource } from "../src/booking/session-token";

type Session = { access_token: string; expires_at?: number };
function fixture(getSession = vi.fn(async () => ({data:{session:null as Session|null}}))) {
  let callback: (event:string,session:Session|null)=>void = ()=>{};
  const unsubscribe=vi.fn();
  return { getSession, unsubscribe, emit(session:Session|null){callback(session?"TOKEN_REFRESHED":"SIGNED_OUT",session);},
    auth: {getSession,onAuthStateChange(fn:typeof callback){callback=fn;return{data:{subscription:{unsubscribe}}};}} };
}
const session=(token="fresh"):Session=>({access_token:token,expires_at:Math.floor(Date.now()/1000)+3600});
afterEach(()=>vi.useRealTimers());
describe("bounded booking session credentials",()=>{
  it("uses fresh Auth event credentials without entering getSession again",async()=>{
    const f=fixture();const source=createBookingTokenSource(f.auth);
    f.emit(session());expect(await source.token()).toBe("fresh");expect(f.getSession).not.toHaveBeenCalled();
    f.emit(session("refreshed"));expect(await source.token()).toBe("refreshed");
    f.emit(null);expect(await source.token()).toBeUndefined();source.dispose();expect(f.unsubscribe).toHaveBeenCalledOnce();
  });
  it("shares initial SDK reads and recovers a pending read from INITIAL_SESSION",async()=>{
    const read=vi.fn(()=>new Promise<{data:{session:Session|null}}>(()=>{}));const f=fixture(read);const source=createBookingTokenSource(f.auth);
    const first=source.token(),second=source.token();await Promise.resolve();expect(read).toHaveBeenCalledOnce();f.emit(session());expect(await first).toBe("fresh");expect(await second).toBe("fresh");source.dispose();
  });
  it("stops a hung SDK read at five seconds and allows a later retry",async()=>{
    vi.useFakeTimers();const f=fixture(vi.fn(()=>new Promise<{data:{session:Session|null}}>(()=>{})));const source=createBookingTokenSource(f.auth);
    const pending=source.token();const rejected=expect(pending).rejects.toMatchObject({status:503,message:"booking.network"});await vi.advanceTimersByTimeAsync(5000);await rejected;
    f.emit(session("after-timeout"));expect(await source.token()).toBe("after-timeout");source.dispose();
  });
  it("never restores an old in-flight credential after logout",async()=>{
    let release!:(value:{data:{session:Session|null}})=>void;const f=fixture(vi.fn(()=>new Promise(resolve=>{release=resolve;})));const source=createBookingTokenSource(f.auth);
    const pending=source.token();await Promise.resolve();f.emit(null);expect(await pending).toBeUndefined();release({data:{session:session("old")}});await Promise.resolve();expect(await source.token()).toBeUndefined();source.dispose();
  });
  it("refreshes expired memory and rejects stale or failed SDK output",async()=>{
    const stale={access_token:"expired",expires_at:Math.floor(Date.now()/1000)-10};const f=fixture(vi.fn(async()=>({data:{session:stale}})));const source=createBookingTokenSource(f.auth);f.emit(stale);await expect(source.token()).rejects.toMatchObject({message:"booking.network"});expect(f.getSession).toHaveBeenCalledOnce();source.dispose();
  });
  it("reads a session once when no event has arrived and redacts SDK errors",async()=>{
    const f=fixture(vi.fn(async()=>({data:{session:session("initial")}})));const source=createBookingTokenSource(f.auth);expect(await source.token()).toBe("initial");expect(await source.token()).toBe("initial");expect(f.getSession).toHaveBeenCalledOnce();source.dispose();
    const failed=fixture(vi.fn(async()=>{throw new Error("PRIVATE_AUTH_PROVIDER_DETAILS");}));const other=createBookingTokenSource(failed.auth);await expect(other.token()).rejects.toMatchObject({message:"booking.network"});other.dispose();
  });
});
