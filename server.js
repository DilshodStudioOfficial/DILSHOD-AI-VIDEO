const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { fal } = require("@fal-ai/client");

const app = express();
const PORT = process.env.PORT || 3000;
const FAL_KEY = process.env.FAL_KEY || "";
const SITE_USER = process.env.SITE_USER || "";
const SITE_PASSWORD = process.env.SITE_PASSWORD || "";

fal.config({ credentials: FAL_KEY });
app.disable("x-powered-by");
app.use(express.json({ limit: "20mb" }));

function safeEqual(a,b){
  const aa=Buffer.from(String(a||""));
  const bb=Buffer.from(String(b||""));
  if(aa.length!==bb.length) return false;
  return crypto.timingSafeEqual(aa,bb);
}

function ownerOnly(req,res,next){
  if(!SITE_USER || !SITE_PASSWORD){
    return res.status(503).send("Owner protection is not configured. Add SITE_USER and SITE_PASSWORD in Render Environment.");
  }
  const auth=req.headers.authorization || "";
  if(!auth.startsWith("Basic ")){
    res.set("WWW-Authenticate", 'Basic realm="DILSHOD AI VIDEO"');
    return res.status(401).send("Login required");
  }
  let decoded="";
  try{ decoded=Buffer.from(auth.slice(6),"base64").toString("utf8"); }catch(_){ }
  const i=decoded.indexOf(":");
  const user=i>=0?decoded.slice(0,i):"";
  const pass=i>=0?decoded.slice(i+1):"";
  if(!safeEqual(user,SITE_USER) || !safeEqual(pass,SITE_PASSWORD)){
    res.set("WWW-Authenticate", 'Basic realm="DILSHOD AI VIDEO"');
    return res.status(401).send("Wrong login or password");
  }
  next();
}

// Everything below is owner-only. Visitors cannot reach the UI or generation API.
app.use(ownerOnly);
app.use(express.static(__dirname));

app.get("/api/health",(req,res)=>res.json({ok:true,falConfigured:Boolean(FAL_KEY),ownerLock:true}));

app.post("/api/generate/text", async (req,res)=>{
  try{
    const {prompt,duration=5,aspectRatio="16:9",audio=false}=req.body||{};
    if(!prompt || !String(prompt).trim()) return res.status(400).json({error:"Введите промт."});
    const d=Number(duration);
    if(![5,10,15].includes(d)) return res.status(400).json({error:"Длительность: 5, 10 или 15 секунд."});
    const result=await fal.subscribe("fal-ai/kling-video/v3/standard/text-to-video",{
      input:{prompt:String(prompt).trim(),duration:String(d),aspect_ratio:aspectRatio,generate_audio:Boolean(audio)},
      logs:true
    });
    const videoUrl=result?.data?.video?.url;
    if(!videoUrl) return res.status(502).json({error:"fal.ai не вернул ссылку на видео."});
    res.json({ok:true,videoUrl,requestId:result.requestId||null});
  }catch(err){
    console.error("TEXT_GENERATION_ERROR",err);
    const detail=err?.body?.detail || err?.message || "Ошибка генерации видео.";
    const status=Number(err?.status)||500;
    res.status(status>=400&&status<600?status:500).json({error:detail});
  }
});

app.post("/api/generate/image", async (req,res)=>{
  try{
    const {prompt="",imageDataUrl,duration=5,aspectRatio="16:9",audio=false}=req.body||{};
    if(!imageDataUrl) return res.status(400).json({error:"Добавьте изображение."});
    const d=Number(duration);
    if(![5,10,15].includes(d)) return res.status(400).json({error:"Длительность: 5, 10 или 15 секунд."});
    const result=await fal.subscribe("fal-ai/kling-video/v3/standard/image-to-video",{
      input:{prompt:String(prompt).trim(),start_image_url:imageDataUrl,duration:String(d),aspect_ratio:aspectRatio,generate_audio:Boolean(audio)},
      logs:true
    });
    const videoUrl=result?.data?.video?.url;
    if(!videoUrl) return res.status(502).json({error:"fal.ai не вернул ссылку на видео."});
    res.json({ok:true,videoUrl,requestId:result.requestId||null});
  }catch(err){
    console.error("IMAGE_GENERATION_ERROR",err);
    const detail=err?.body?.detail || err?.message || "Ошибка генерации видео.";
    const status=Number(err?.status)||500;
    res.status(status>=400&&status<600?status:500).json({error:detail});
  }
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(PORT,"0.0.0.0",()=>console.log(`DILSHOD AI VIDEO owner-locked on port ${PORT}`));
