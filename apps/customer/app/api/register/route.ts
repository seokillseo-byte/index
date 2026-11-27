import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
const api=()=>process.env.API_INTERNAL_URL||'http://localhost:4000';
function sameOrigin(req:NextRequest){const origin=req.headers.get('origin');if(!origin)return true;try{return new URL(origin).host===req.headers.get('host');}catch{return false;}}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return NextResponse.json({message:'Invalid request origin'},{status:403});
 const body=await req.json().catch(()=>null);if(!body?.email||!body?.password||!body?.displayName||!body?.workspaceName)return NextResponse.json({message:'All registration fields are required'},{status:400});
 const upstream=await fetch(api()+'/api/v1/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
 const data=await upstream.json().catch(()=>({message:'Registration service unavailable'}));if(!upstream.ok)return NextResponse.json(data,{status:upstream.status});
 const secure=process.env.NODE_ENV==='production',jar=await cookies();jar.set('ia_access',data.accessToken,{httpOnly:true,secure,sameSite:'strict',path:'/',maxAge:Number(data.expiresIn)||900});jar.set('ia_refresh',data.refreshToken,{httpOnly:true,secure,sameSite:'strict',path:'/',maxAge:30*24*60*60});
 return NextResponse.json({user:data.user,workspace:data.workspace},{headers:{'cache-control':'no-store'}});
}
