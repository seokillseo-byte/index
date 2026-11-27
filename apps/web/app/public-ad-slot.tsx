'use client';
import {useEffect,useRef,useState} from 'react';
type Props={code:string};
const api=()=>process.env.NEXT_PUBLIC_API_URL||'https://api.index-assist.io.vn';
export function PublicAdSlot({code}:Props){
 const [ad,setAd]=useState<any>(null),ref=useRef<HTMLDivElement>(null),impression=useRef(false);
 useEffect(()=>{let live=true;fetch(api()+'/api/v1/public/ads/slots/'+encodeURIComponent(code),{cache:'no-store'}).then(async r=>{if(!r.ok)return null;return r.json();}).then(d=>{if(live&&d)setAd(d);}).catch(()=>{});return()=>{live=false};},[code]);
 useEffect(()=>{if(!ad||!ref.current||impression.current)return;const node=ref.current;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting&&e.intersectionRatio>=0.5)&&!impression.current){impression.current=true;fetch(api()+'/api/v1/public/ads/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({campaignId:ad.campaign_id,creativeId:ad.creative_id,slotId:ad.slot_id,eventType:'impression',consentState:'contextual_only'}),keepalive:true}).catch(()=>{});observer.disconnect();}},{threshold:[0.5]});observer.observe(node);return()=>observer.disconnect();},[ad]);
 if(!ad)return null;
 const image=/^https?:\/\//i.test(ad.asset_key||'');
 function click(){fetch(api()+'/api/v1/public/ads/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({campaignId:ad.campaign_id,creativeId:ad.creative_id,slotId:ad.slot_id,eventType:'click',consentState:'contextual_only'}),keepalive:true}).catch(()=>{});}
 return <aside className="ad-card" ref={ref} aria-label="Quảng cáo"><div>{image&&<img src={ad.asset_key} alt={ad.alt_text||''}/>}</div><div style={{flex:1}}><div className="ad-label">{ad.disclosure_label||'Quảng cáo'}</div><strong>{ad.headline||'Đối tác của Index Assist'}</strong><p>Nội dung tài trợ theo ngữ cảnh.</p></div><a className="button-secondary" href={ad.destination_url} target="_blank" rel="sponsored nofollow noopener" onClick={click}>Tìm hiểu</a></aside>;
}
