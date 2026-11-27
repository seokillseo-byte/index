import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
const api=()=>process.env.API_INTERNAL_URL||'http://localhost:4000';
const secure=()=>process.env.NODE_ENV==='production';
const opts=(maxAge:number)=>({httpOnly:true,secure:secure(),sameSite:'strict' as const,path:'/',maxAge});
function sameOrigin(req:NextRequest){const origin=req.headers.get('origin');if(!origin)return true;try{return new URL(origin).host===req.headers.get('host');}catch{return false;}}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return NextResponse.json({message:'Invalid request origin'},{status:403});
 const body=await req.json().catch(()=>null);if(!body?.email||!body?.password)return NextResponse.json({message:'Email and password are required'},{status:400});
 const upstream=await fetch(api()+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
 const data=await upstream.json().catch(()=>({message:'Authentication service unavailable'}));
 if(!upstream.ok)return NextResponse.json(data,{status:upstream.status});
 const jar=await cookies();jar.set('ia_access',data.accessToken,opts(Number(data.expiresIn)||900));jar.set('ia_refresh',data.refreshToken,opts(30*24*60*60));
 return NextResponse.json({user:data.user,workspace:data.workspace},{headers:{'cache-control':'no-store'}});
}
export async function DELETE(req:NextRequest){if(!sameOrigin(req))return NextResponse.json({message:'Invalid request origin'},{status:403});const jar=await cookies();const access=jar.get('ia_access')?.value;if(access){await fetch(api()+'/api/v1/auth/logout',{method:'POST',headers:{authorization:'Bearer '+access},cache:'no-store'}).catch(()=>{});}jar.delete('ia_access');jar.delete('ia_refresh');return NextResponse.json({ok:true});}
