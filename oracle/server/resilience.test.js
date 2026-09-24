import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { extractTelegramInitData } from "../src/api.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");

test("extracts Telegram init data without the external SDK",()=>{
  const initData="query_id=AAE+route&user=%7B%22id%22%3A42%7D&auth_date=123&hash=abc";
  const href=`https://oracle.example/#tgWebAppData=${encodeURIComponent(initData)}&tgWebAppVersion=9.1`;
  assert.equal(extractTelegramInitData(href),initData);
});

test("third-party resources cannot block the application shell",async()=>{
  const [html,styles]=await Promise.all([
    readFile(path.join(root,"index.html"),"utf8"),
    readFile(path.join(root,"src/styles.css"),"utf8"),
  ]);
  const appScript=html.indexOf('<script type="module"');
  const telegramScript=html.indexOf('<script async src="https://telegram.org');
  assert.ok(appScript>=0&&telegramScript>appScript);
  assert.equal(styles.includes("fonts.googleapis.com"),false);
});
