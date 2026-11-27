import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
type Context={params:Promise<{path:string[]}>};
const api=()=>process.env.API_INTERNAL_URL||'http://localhost:4000';
function secure(){return process.env.NODE_ENV==='production';}
function setTokens(jar:Awaited<ReturnType<typeof cookies>>,data:any){
 jar.set('ia_access',data.accessToken,{httpOnly:true,secure:secure(),sameSite:'strict',path:'/',maxAge:Number(data.expiresIn)||900});
 jar.set('ia_refresh',data.refreshToken,{httpOnly:true,secure:secure(),sameSite:'strict',path:'/',maxAge:30*24*60*60});
}
async function forward(req:NextRequest,ctx:Context){
 const {path}=await ctx.params;
 if(!path?.length||path[0]!=='admin'||path.some(part=>part==='..'||part.includes('\\')))return NextResponse.json({message:'Invalid API route'},{status:404});
 const jar=await cookies();let access=jar.get('ia_access')?.value;
 if(!access)return NextResponse.json({message:'Authentication required'},{status:401});
 const url=api()+'/api/v1/'+path.map(encodeURIComponent).join('/')+new URL(req.url).search;
 const headers=new Headers();headers.set('authorization','Bearer '+access);const type=req.headers.get('content-type');if(type)headers.set('content-type',type);
 const init:any={method:req.method,headers,cache:'no-store'};
 if(!['GET','HEAD'].includes(req.method))init.body=await req.text();
 let upstream=await fetch(url,init);
 if(upstream.status===401){
  const refresh=jar.get('ia_refresh')?.value;
  if(refresh){
   const rotated=await fetch(api()+'/api/v1/auth/refresh',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refreshToken:refresh}),cache:'no-store'});
   const data=await rotated.json().catch(()=>null);
   if(rotated.ok&&data?.accessToken){setTokens(jar,data);headers.set('authorization','Bearer '+data.accessToken);upstream=await fetch(url,{...init,headers});}
   else{jar.delete('ia_access');jar.delete('ia_refresh');}
  }
 }
 const body=await upstream.text();return new NextResponse(body,{status:upstream.status,headers:{'content-type':upstream.headers.get('content-type')||'application/json','cache-control':'no-store'}});
}
export const GET=forward;export const POST=forward;export const PATCH=forward;export const DELETE=forward;
