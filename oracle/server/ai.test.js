import assert from "node:assert/strict";
import test from "node:test";
import { createReading } from "./ai.js";

test("fallback oracle remains specific and structured",async()=>{
  const result=await createReading("oracle",{sphere:"карьера",question:"Стоит ли соглашаться на новую работу в другом городе?"});
  assert.match(result.verdict,/новую работу|другом городе/i);
  assert.ok(result.text.length>180);
  assert.ok(result.hidden.length>40);
  assert.ok(result.action.length>60);
  assert.ok(result.reflection.endsWith("?"));
});

test("fallback dream names the user's image",async()=>{
  const result=await createReading("dream",{dream:"Я шёл по тёмному вокзалу и не мог найти свой поезд"});
  assert.match(result.verdict,/вокзалу|поезд/i);
  assert.equal(result.cards.length,0);
});
