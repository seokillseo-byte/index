'use client';
import {FormEvent,useState} from 'react';
import {useRouter} from 'next/navigation';
export default function AdminLogin(){
 const router=useRouter(),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setLoading(true);setError('');try{const r=await fetch('/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});const d=await r.json();if(!r.ok)throw new Error(d.message||'Đăng nhập thất bại');router.replace('/');router.refresh();}catch(e){setError(e instanceof Error?e.message:'Không thể đăng nhập');}finally{setLoading(false);}}
 return <main className="login-wrap"><form className="login-card" onSubmit={submit}><div className="brand">INDEX ASSIST<small>PLATFORM CONTROL</small></div><h1>Đăng nhập quản trị</h1><p className="muted">Chỉ tài khoản đã được cấp quyền platform administrator mới có thể truy cập.</p><div className="form-grid"><label className="field">Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="field">Mật khẩu<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="error">{error}</p>}<button className="primary" disabled={loading}>{loading?'Đang xác thực…':'Đăng nhập'}</button></div></form></main>;
}
