'use client';
import {useCallback,useEffect,useState} from 'react';
import {AdminShell} from './admin-shell';
type Action={label:string;value:string;body?:Record<string,unknown>};
type Props={title:string;description:string;endpoint:string;columns:string[];actionPath:(id:string)=>string;actions:Action[];bodyKey?:string};
export function AdminActionDataPage({title,description,endpoint,columns,actionPath,actions,bodyKey='status'}:Props){
 const [items,setItems]=useState<Record<string,any>[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const load=useCallback(async()=>{setLoading(true);try{const r=await fetch('/api/proxy/admin/'+endpoint,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.message||'Không thể tải dữ liệu');setItems(Array.isArray(d)?d:(d.items||[]));setError('');}catch(e){setError(e instanceof Error?e.message:'Lỗi tải dữ liệu');}finally{setLoading(false);}},[endpoint]);
 useEffect(()=>{load();},[load]);
 async function act(row:Record<string,any>,action:Action){const id=String(row.id);setBusy(id+action.value);setError('');try{const body=action.body||{[bodyKey]:action.value};const r=await fetch('/api/proxy/admin/'+actionPath(id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.message||'Không thể cập nhật');await load();}catch(e){setError(e instanceof Error?e.message:'Lỗi cập nhật');}finally{setBusy('');}}
 return <AdminShell><div className="page-head"><div><div className="eyebrow">INDEX ASSIST / ADMIN</div><h1>{title}</h1><p>{description}</p></div></div>{error&&<div className="notice error">{error}</div>}{loading?<div className="notice">Đang tải dữ liệu…</div>:<div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c}>{c.replaceAll('_',' ').toUpperCase()}</th>)}<th>THAO TÁC</th></tr></thead><tbody>{items.map((row,i)=><tr key={row.id||i}>{columns.map(c=><td key={c}>{render(row[c])}</td>)}<td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{actions.map(a=><button key={a.value} disabled={busy===String(row.id)+a.value} className="action-button" onClick={()=>act(row,a)}>{busy===String(row.id)+a.value?'…':a.label}</button>)}</div></td></tr>)}{items.length===0&&<tr><td colSpan={columns.length+1}>Chưa có dữ liệu.</td></tr>}</tbody></table></div>}</AdminShell>;
}
function render(v:any){if(v===null||v===undefined)return '—';if(typeof v==='object')return JSON.stringify(v);if(typeof v==='string'&&v.length>90)return v.slice(0,90)+'…';return String(v);}
