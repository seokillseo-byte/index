'use client';
import {useEffect,useState} from 'react';
import {AdminShell} from './admin-shell';
type Props={title:string;description:string;endpoint:string;columns:string[];withShell?:boolean};
export function AdminDataPage({title,description,endpoint,columns,withShell=true}:Props){
 const [items,setItems]=useState<Record<string,any>[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let live=true;fetch('/api/proxy/admin/'+endpoint,{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.message||'Không thể tải dữ liệu');return d;}).then(d=>{if(live)setItems(Array.isArray(d)?d:(d.items||[]));}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false};},[endpoint]);
 const content=<><div className="page-head"><div><div className="eyebrow">INDEX ASSIST / ADMIN</div><h1>{title}</h1><p>{description}</p></div></div>{loading?<div className="notice">Đang tải dữ liệu...</div>:error?<div className="notice error">{error}</div>:<div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c}>{c.replaceAll('_',' ').toUpperCase()}</th>)}</tr></thead><tbody>{items.map((row,i)=><tr key={row.id||i}>{columns.map(c=><td key={c}>{renderValue(row[c])}</td>)}</tr>)}{items.length===0&&<tr><td colSpan={columns.length}>Chưa có dữ liệu.</td></tr>}</tbody></table></div>}</>;
 return withShell?<AdminShell>{content}</AdminShell>:content;
}
function renderValue(value:any){if(value===null||value===undefined)return '—';if(typeof value==='object')return JSON.stringify(value);if(typeof value==='string'&&value.length>100)return value.slice(0,100)+'…';return String(value);}
