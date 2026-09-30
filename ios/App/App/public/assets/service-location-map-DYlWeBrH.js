import{a as l,e as m}from"./react-vendor-DPsuY2Bf.js";import{L as n}from"./maps-vendor-DnRLxOut.js";const h=n.divIcon({className:"custom-marker",html:`<div style="
    width: 40px; height: 40px;
    background: hsl(221 83% 53%);
    border: 3px solid #fff;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    font-size: 18px;
  ">📍</div>`,iconSize:[40,40],iconAnchor:[20,40],popupAnchor:[0,-40]}),b=n.divIcon({className:"custom-marker",html:`<div style="
    width: 34px; height: 34px;
    background: #1a1a1a;
    border: 3px solid hsl(221 83% 53%);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    font-size: 15px;
  ">🔧</div>`,iconSize:[34,34],iconAnchor:[17,34],popupAnchor:[0,-34]});function y({serviceLat:e,serviceLng:i,workers:s=[],onWorkerClick:r,className:u}){const c=l.useRef(null),a=l.useRef(null);return l.useEffect(()=>{if(!c.current)return;a.current&&a.current.remove();const o=n.map(c.current,{center:[e,i],zoom:13,zoomControl:!1});n.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{attribution:"&copy; OSM &copy; CARTO",maxZoom:19}).addTo(o),n.control.zoom({position:"bottomright"}).addTo(o),n.marker([e,i],{icon:h}).addTo(o).bindPopup('<div style="font-family:system-ui;text-align:center;padding:4px;"><strong>Ubicación del servicio</strong></div>');const p=n.latLngBounds([[e,i]]);return s.forEach(t=>{if(t.lat==null||t.lng==null)return;const x=t.rating?"⭐ "+t.rating.toFixed(1):"Nuevo",d=t.distanceKm!=null?`${t.distanceKm.toFixed(1)} km`:"",f=n.marker([t.lat,t.lng],{icon:b}).addTo(o).bindPopup(`
          <div style="font-family:system-ui;min-width:140px;padding:4px;">
            <strong style="font-size:13px;">${t.name}</strong><br/>
            <span style="font-size:11px;color:#999;">${x}</span>
            ${d?`<br/><span style="font-size:11px;color:#aaa;">📍 A ${d}</span>`:""}
            <div style="margin-top:6px;font-size:11px;color:#22c55e;font-weight:600;">● Disponible</div>
          </div>
        `);r&&f.on("click",()=>r(t.id)),p.extend([t.lat,t.lng])}),s.some(t=>t.lat!=null)&&o.fitBounds(p,{padding:[50,50],maxZoom:14}),a.current=o,()=>{o.remove(),a.current=null}},[e,i,s.length]),m.jsxDEV("div",{"data-replit-metadata":"runner/workspace/client/components/service-location-map.tsx:127:4","data-component-name":"div",style:{isolation:"isolate"},children:m.jsxDEV("div",{"data-replit-metadata":"runner/workspace/client/components/service-location-map.tsx:128:6","data-component-name":"div",ref:c,className:u,style:{width:"100%",minHeight:"260px"}},void 0,!1,{fileName:"/home/runner/workspace/client/components/service-location-map.tsx",lineNumber:128,columnNumber:7},this)},void 0,!1,{fileName:"/home/runner/workspace/client/components/service-location-map.tsx",lineNumber:127,columnNumber:5},this)}export{y as default};
