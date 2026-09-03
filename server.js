const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const Stripe = require("stripe");
const { fal } = require("@fal-ai/client");

const app = express();
const PORT = process.env.PORT || 10000;
const FAL_KEY = process.env.FAL_KEY || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const SITE_USER = process.env.SITE_USER || "";
const SITE_PASSWORD = process.env.SITE_PASSWORD || "";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
fal.config({ credentials: FAL_KEY });
app.disable("x-powered-by");

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
let db = { users: {}, paidSessions: {}, generations: [], ledger: [] };
try { if (fs.existsSync(DATA_FILE)) db = { ...db, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) }; } catch (e) { console.error("DATA_READ_ERROR", e.message); }
function saveDb() { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8"); }

const PACKAGES = {
  starter: { credits: 50, eur: 5, label: "Starter — 50 CR" },
  creator: { credits: 150, eur: 12, label: "Creator — 150 CR" },
  studio: { credits: 400, eur: 25, label: "Studio — 400 CR" },
  business: { credits: 1000, eur: 55, label: "Business — 1000 CR" }
};
function newId() { return crypto.randomBytes(18).toString("hex"); }
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) { return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString("hex")}`; }
function verifyPassword(password, stored) { try { const [salt, hash] = String(stored).split(":"); const actual = crypto.scryptSync(String(password), salt, 64).toString("hex"); return crypto.timingSafeEqual(Buffer.from(actual,"hex"), Buffer.from(hash,"hex")); } catch { return false; } }
function sign(v) { return crypto.createHmac("sha256", SESSION_SECRET).update(v).digest("hex"); }
function setSession(res, user) { const payload = Buffer.from(JSON.stringify({id:user.id,email:user.email,name:user.name})).toString("base64url"); res.setHeader("Set-Cookie", `ds_session=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`); }
function getSession(req) { const cookie=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("ds_session=")); if(!cookie)return null; const token=cookie.slice(11), dot=token.lastIndexOf("."); if(dot<1)return null; const payload=token.slice(0,dot), sig=token.slice(dot+1), expected=sign(payload); if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null; try{return JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));}catch{return null;} }
function currentUser(req){ const s=getSession(req); return s ? db.users[s.id] || null : null; }
function auth(req,res,next){ const user=currentUser(req); if(!user)return res.status(401).json({error:"Войдите в аккаунт."}); if(user.blocked)return res.status(403).json({error:"Аккаунт заблокирован."}); req.user=user; next(); }
function admin(req,res,next){ const user=currentUser(req); if(!user)return res.status(401).json({error:"Войдите в аккаунт."}); const ok=(ADMIN_EMAIL && user.email===ADMIN_EMAIL) || (SITE_USER && SITE_PASSWORD && user.email===SITE_USER); if(!ok)return res.status(403).json({error:"Нет доступа администратора."}); req.user=user; next(); }
function generationCost(duration,audio,quality){ const d=Number(duration); if(![5,10,15].includes(d))throw new Error("Длительность: 5, 10 или 15 секунд."); let cost=d; if(audio)cost=Math.ceil(cost*1.5); if(quality==="pro")cost=Math.ceil(cost*1.25); return cost; }
const generationLocks=new Set();
function ledger(userId,type,credits,meta={}){ db.ledger.unshift({id:newId(),userId,type,credits,meta,createdAt:new Date().toISOString()}); db.ledger=db.ledger.slice(0,10000); }
function addGeneration(userId, data){ db.generations.unshift({id:newId(),userId,...data,createdAt:new Date().toISOString()}); db.generations=db.generations.slice(0,10000); }

// Stripe webhook must receive raw body before express.json().
app.post("/api/stripe/webhook", express.raw({type:"application/json"}), (req,res)=>{
  if(!stripe||!STRIPE_WEBHOOK_SECRET)return res.status(503).send("Webhook not configured.");
  let event; try{ event=stripe.webhooks.constructEvent(req.body,req.headers["stripe-signature"],STRIPE_WEBHOOK_SECRET); }catch(err){ console.error("STRIPE_WEBHOOK_ERROR",err.message); return res.status(400).send("Webhook Error"); }
  if(event.type==="checkout.session.completed"){
    const session=event.data.object, userId=session.metadata?.user_id, packageId=session.metadata?.package_id, pkg=PACKAGES[packageId];
    if(userId&&pkg&&!db.paidSessions[session.id]){ const user=db.users[userId]; if(user){ user.credits=Number(user.credits||0)+pkg.credits; user.purchases=user.purchases||[]; user.purchases.unshift({sessionId:session.id,packageId,credits:pkg.credits,amount:session.amount_total,currency:session.currency,createdAt:new Date().toISOString()}); db.paidSessions[session.id]=true; ledger(user.id,"purchase",pkg.credits,{packageId,sessionId:session.id,amount:session.amount_total,currency:session.currency}); saveDb(); console.log(`PAYMENT OK: ${user.email} +${pkg.credits} CR`); } }
  }
  res.json({received:true});
});
app.use(express.json({limit:"2mb"}));
app.use(express.static(path.join(__dirname,"public")));

app.get("/api/health",(req,res)=>res.json({ok:true,configured:Boolean(FAL_KEY),stripeConfigured:Boolean(STRIPE_SECRET_KEY),webhookConfigured:Boolean(STRIPE_WEBHOOK_SECRET),ownerLock:false,customerAccounts:true,credits:true}));
app.get("/api/me",(req,res)=>{ const user=currentUser(req); if(!user)return res.json({logged:false}); res.json({logged:true,user:{id:user.id,name:user.name,email:user.email,credits:Number(user.credits||0),blocked:Boolean(user.blocked),purchases:(user.purchases||[]).slice(0,20)}}); });

app.post("/api/auth/register",(req,res)=>{ const {name,email,password}=req.body||{}, normalized=String(email||"").trim().toLowerCase(); if(!normalized||!password||String(password).length<8)return res.status(400).json({error:"Email и пароль минимум 8 символов обязательны."}); if(Object.values(db.users).some(u=>u.email===normalized))return res.status(409).json({error:"Этот email уже зарегистрирован."}); const user={id:newId(),name:String(name||"User").trim().slice(0,60)||"User",email:normalized,passwordHash:hashPassword(password),credits:0,purchases:[],blocked:false}; db.users[user.id]=user; ledger(user.id,"signup",0); saveDb(); setSession(res,user); res.json({ok:true,user:{id:user.id,name:user.name,email:user.email,credits:0}}); });
app.post("/api/auth/login",(req,res)=>{ const normalized=String(req.body?.email||"").trim().toLowerCase(), user=Object.values(db.users).find(u=>u.email===normalized); if(!user||!verifyPassword(req.body?.password||"",user.passwordHash))return res.status(401).json({error:"Неверный email или пароль."}); if(user.blocked)return res.status(403).json({error:"Аккаунт заблокирован."}); setSession(res,user); res.json({ok:true,user:{id:user.id,name:user.name,email:user.email,credits:Number(user.credits||0)}}); });
app.post("/api/auth/logout",(req,res)=>{res.setHeader("Set-Cookie","ds_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");res.json({ok:true});});

app.get("/api/packages",(req,res)=>res.json(PACKAGES));
app.post("/api/stripe/create-checkout-session",auth,async(req,res)=>{ try{ if(!stripe)return res.status(503).json({error:"Stripe не настроен."}); const pkg=PACKAGES[req.body?.packageId]; if(!pkg)return res.status(400).json({error:"Неизвестный пакет."}); const base=PUBLIC_URL||`${req.protocol}://${req.get("host")}`; const session=await stripe.checkout.sessions.create({mode:"payment",line_items:[{price_data:{currency:"eur",product_data:{name:`DILSHOD AI VIDEO — ${pkg.credits} CR`},unit_amount:Math.round(pkg.eur*100)},quantity:1}],customer_email:req.user.email,client_reference_id:req.user.id,metadata:{user_id:req.user.id,package_id:req.body.packageId},success_url:`${base}/?payment=success`,cancel_url:`${base}/?payment=cancelled`}); res.json({url:session.url}); }catch(err){console.error("STRIPE_CHECKOUT_ERROR",err);res.status(500).json({error:"Не удалось создать оплату Stripe."});} });

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:50*1024*1024}});
async function uploadImageToFal(file){return fal.storage.upload(new File([file.buffer],file.originalname||"image.jpg",{type:file.mimetype}));}
async function runGeneration(req,res,kind,opts){
  if(generationLocks.has(req.user.id))return res.status(429).json({error:"У вас уже идёт генерация. Дождитесь результата."});
  const cost=opts.cost;
  if(Number(req.user.credits)<cost)return res.status(402).json({error:`Недостаточно кредитов. Нужно ${cost} CR.`,credits:Number(req.user.credits||0)});
  if(!FAL_KEY)return res.status(503).json({error:"FAL_KEY не настроен."});
  generationLocks.add(req.user.id);
  req.user.credits-=cost; ledger(req.user.id,"generation",-cost,{kind}); saveDb();
  try{
    const result=await fal.subscribe(opts.model,{input:opts.input,logs:true});
    const videoUrl=result?.data?.video?.url; if(!videoUrl)throw new Error("fal.ai не вернул видео.");
    addGeneration(req.user.id,{kind,videoUrl,charged:cost,requestId:result.requestId||null,duration:opts.duration,quality:opts.quality,audio:opts.audio}); saveDb();
    res.json({ok:true,videoUrl,charged:cost,credits:req.user.credits,requestId:result.requestId||null});
  }catch(err){ req.user.credits+=cost; ledger(req.user.id,"refund",cost,{kind,reason:"generation_failed"}); saveDb(); console.error(`${kind.toUpperCase()}_GENERATION_ERROR`,err); const detail=err?.body?.detail||err?.message||"Ошибка генерации."; const status=Number(err?.status); res.status(status>=400&&status<600?status:500).json({error:detail,credits:req.user.credits}); }
  finally{generationLocks.delete(req.user.id);}
}
app.post("/api/generate/text",auth,async(req,res)=>{try{const {prompt,duration=5,aspectRatio="16:9",quality="standard",audio=false}=req.body||{};if(!String(prompt||"").trim())return res.status(400).json({error:"Введите промт."});const d=Number(duration),a=Boolean(audio),q=String(quality);const cost=generationCost(d,a,q);return runGeneration(req,res,"text",{cost,duration:d,audio:a,quality:q,model:"fal-ai/kling-video/v3/standard/text-to-video",input:{prompt:String(prompt).trim().slice(0,2500),duration:String(d),aspect_ratio:aspectRatio,generate_audio:a}});}catch(e){return res.status(400).json({error:e.message});}});
app.post("/api/generate/image",auth,upload.single("image"),async(req,res)=>{try{if(!req.file)return res.status(400).json({error:"Загрузите фотографию."});const duration=Number(req.body?.duration||5),quality=String(req.body?.quality||"standard"),audio=String(req.body?.audio||"false")==="true",prompt=String(req.body?.prompt||"Animate the uploaded image with realistic natural motion."),aspectRatio=String(req.body?.aspectRatio||"16:9"),cost=generationCost(duration,audio,quality);if(Number(req.user.credits)<cost)return res.status(402).json({error:`Недостаточно кредитов. Нужно ${cost} CR.`,credits:req.user.credits});if(!FAL_KEY)return res.status(503).json({error:"FAL_KEY не настроен."});if(generationLocks.has(req.user.id))return res.status(429).json({error:"У вас уже идёт генерация. Дождитесь результата."});generationLocks.add(req.user.id);req.user.credits-=cost;ledger(req.user.id,"generation",-cost,{kind:"image"});saveDb();try{const imageUrl=await uploadImageToFal(req.file);const result=await fal.subscribe("fal-ai/kling-video/v3/standard/image-to-video",{input:{prompt:prompt.slice(0,2500),start_image_url:imageUrl,duration:String(duration),aspect_ratio:aspectRatio,generate_audio:audio},logs:true});const videoUrl=result?.data?.video?.url;if(!videoUrl)throw new Error("fal.ai не вернул видео.");addGeneration(req.user.id,{kind:"image",videoUrl,charged:cost,requestId:result.requestId||null,duration,quality,audio});saveDb();res.json({ok:true,videoUrl,charged:cost,credits:req.user.credits,requestId:result.requestId||null});}catch(err){req.user.credits+=cost;ledger(req.user.id,"refund",cost,{kind:"image",reason:"generation_failed"});saveDb();console.error("IMAGE_GENERATION_ERROR",err);res.status(500).json({error:err?.body?.detail||err?.message||"Ошибка генерации.",credits:req.user.credits});}finally{generationLocks.delete(req.user.id);}}catch(e){res.status(400).json({error:e.message});}});

app.get("/api/history",auth,(req,res)=>res.json({generations:db.generations.filter(g=>g.userId===req.user.id).slice(0,100),ledger:db.ledger.filter(x=>x.userId===req.user.id).slice(0,100)}));
app.get("/api/admin/stats",admin,(req,res)=>{const users=Object.values(db.users);res.json({users:users.length,active:users.filter(u=>!u.blocked).length,credits:users.reduce((s,u)=>s+Number(u.credits||0),0),generations:db.generations.length,payments:Object.keys(db.paidSessions).length,revenueCents:users.reduce((s,u)=>s+(u.purchases||[]).reduce((a,p)=>a+Number(p.amount||0),0),0)});});
app.get("/api/admin/users",admin,(req,res)=>res.json({users:Object.values(db.users).map(u=>({id:u.id,name:u.name,email:u.email,credits:Number(u.credits||0),blocked:Boolean(u.blocked),purchases:(u.purchases||[]).length,createdAt:u.createdAt||null}))}));
app.post("/api/admin/users/:id/credits",admin,(req,res)=>{const u=db.users[req.params.id];const amount=Number(req.body?.amount);if(!u||!Number.isFinite(amount))return res.status(400).json({error:"Неверные данные."});u.credits=Math.max(0,Number(u.credits||0)+Math.trunc(amount));ledger(u.id,"admin_adjustment",Math.trunc(amount),{admin:req.user.email});saveDb();res.json({ok:true,credits:u.credits});});
app.post("/api/admin/users/:id/block",admin,(req,res)=>{const u=db.users[req.params.id];if(!u)return res.status(404).json({error:"Пользователь не найден."});u.blocked=Boolean(req.body?.blocked);saveDb();res.json({ok:true,blocked:u.blocked});});

app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get(/.*/,(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,"0.0.0.0",()=>console.log(`DILSHOD AI VIDEO complete on port ${PORT}`));
