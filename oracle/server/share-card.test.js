import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { renderShareCard, signShareCard, verifyShareCard } from "./share-card.js";

test("share card signatures reject tampering",()=>{
  const id="00000000-0000-4000-8000-000000000001";
  const signature=signShareCard(id);
  assert.equal(verifyShareCard(id,signature),true);
  assert.equal(verifyShareCard(`${id}x`,signature),false);
});

test("renders a vertical PNG story card",async()=>{
  const png=await renderShareCard({
    kind:"tarot",
    title:"Послание трёх карт",
    first_name:"Александр",
    result:{text:"Перед вами открывается возможность посмотреть на ситуацию спокойнее и заметить новый путь.",reflection:"Что вы уже знаете, но пока не решаетесь признать?",cards:["Звезда","Сила","Солнце"]},
  });
  const metadata=await sharp(png).metadata();
  assert.equal(metadata.format,"png");
  assert.equal(metadata.width,1080);
  assert.equal(metadata.height,1920);
});
