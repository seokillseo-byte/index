'use client';
import {FormEvent,useState} from 'react';
import {useRouter} from 'next/navigation';
export default function Login(){
 const router=useRouter(),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setLoading(true);setError('');try{const r=await fetch('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});const d=await r.json();if(!r.ok)throw new Error(d.message||'Đăng nhập thất bại');router.replace('/');router.refresh();}catch(e){setError(e instanceof Error?e.message:'Không thể đăng nhập');}finally{setLoading(false);}}
 return <main className="login-wrap"><form className="login-card" onSubmit={submit}><div className="brand" style={{color:'#10213b'}}>INDEX ASSIST<small>SEO WORKSPACE</small></div><h1>Đăng nhập workspace</h1><p className="muted">Quản lý backlink, URL ingestion và trạng thái Google/Bing.</p><div className="form-grid"><label className="field">Email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="field">Mật khẩu<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="error">{error}</p>}<button className="primary" disabled={loading}>{loading?'Đang đăng nhập…':'Đăng nhập'}</button></div></form></main>;
}
