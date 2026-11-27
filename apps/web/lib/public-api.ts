const base=()=>process.env.API_INTERNAL_URL||'http://localhost:4000';
export async function publicApi(path:string){const r=await fetch(base()+'/api/v1/public/'+path,{next:{revalidate:60}});if(!r.ok)return null;return r.json();}
export async function cmsApi(path:string){const r=await fetch(base()+'/api/v1/public/cms/'+path,{next:{revalidate:60}});if(!r.ok)return null;return r.json();}
