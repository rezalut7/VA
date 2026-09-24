import assert from "node:assert/strict";
import test from "node:test";
import { signSession, termsKeyboard, verifySession } from "./telegram.js";

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

test("terms keyboard requires explicit acceptance",()=>{
  const keyboard=termsKeyboard();
  assert.equal(keyboard.inline_keyboard[0][0].callback_data,"accept_terms_v1");
  assert.match(keyboard.inline_keyboard[1][0].url,/\/terms$/);
});
