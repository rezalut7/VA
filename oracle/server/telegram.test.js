import assert from "node:assert/strict";
import test from "node:test";
import { signSession, verifySession } from "./telegram.js";

test("session round trip",()=>{
  const token=signSession({userId:"user-1",telegramId:"42"});
  const session=verifySession(token);
  assert.equal(session.userId,"user-1");
  assert.equal(session.telegramId,"42");
});

test("tampered session is rejected",()=>{
  const token=signSession({userId:"user-1"});
  const [body,signature]=token.split(".");
  assert.equal(verifySession(`${body}x.${signature}`),null);
});
