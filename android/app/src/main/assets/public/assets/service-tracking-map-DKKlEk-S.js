import{a as s,e as d}from"./react-vendor-DPsuY2Bf.js";import{L as n}from"./maps-vendor-DnRLxOut.js";const b=n.divIcon({className:"custom-marker",html:`<div style="
    width: 40px; height: 40px;
    background: hsl(221 83% 53%);
    border: 3px solid #fff;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    font-size: 18px;
  ">📍</div>`,iconSize:[40,40],iconAnchor:[20,40],popupAnchor:[0,-40]}),m=n.divIcon({className:"custom-marker",html:`<div style="
    width: 40px; height: 40px;
    background: #22c55e;
    border: 3px solid #fff;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    font-size: 18px;
    animation: pulse-green 2s infinite;
  ">🔧</div>
  <style>
    @keyframes pulse-green {
      0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
      50% { box-shadow: 0 0 0 10px rgba(34,197,94,0); }
    }
  </style>`,iconSize:[40,40],iconAnchor:[20,40],popupAnchor:[0,-40]});function y({serviceLat:a,serviceLng:c,workerLat:t,workerLng:o,workerName:l="Profesional",className:u}){const p=s.useRef(null),i=s.useRef(null),r=s.useRef(null);return s.useEffect(()=>{if(!p.current)return;i.current&&i.current.remove();const e=n.map(p.current,{center:[a,c],zoom:14,zoomControl:!1});if(n.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{attribution:"&copy; OSM &copy; CARTO",maxZoom:19}).addTo(e),n.control.zoom({position:"bottomright"}).addTo(e),n.marker([a,c],{icon:b}).addTo(e).bindPopup('<div style="font-family:system-ui;text-align:center;padding:4px;"><strong>Ubicación del servicio</strong></div>'),t!=null&&o!=null){const f=n.marker([t,o],{icon:m}).addTo(e).bindPopup(`<div style="font-family:system-ui;text-align:center;padding:4px;"><strong>${l}</strong><br/><span style="color:#22c55e;font-size:11px;">● En camino</span></div>`);r.current=f;const x=n.latLngBounds([[a,c],[t,o]]);e.fitBounds(x,{padding:[50,50],maxZoom:15})}return i.current=e,()=>{e.remove(),i.current=null,r.current=null}},[a,c]),s.useEffect(()=>{if(i.current&&!(t==null||o==null))if(r.current)r.current.setLatLng([t,o]);else{const e=n.marker([t,o],{icon:m}).addTo(i.current).bindPopup(`<div style="font-family:system-ui;text-align:center;padding:4px;"><strong>${l}</strong><br/><span style="color:#22c55e;font-size:11px;">● En camino</span></div>`);r.current=e}},[t,o,l]),d.jsxDEV("div",{"data-replit-metadata":"runner/workspace/client/components/service-tracking-map.tsx:122:4","data-component-name":"div",style:{isolation:"isolate"},children:d.jsxDEV("div",{"data-replit-metadata":"runner/workspace/client/components/service-tracking-map.tsx:123:6","data-component-name":"div",ref:p,className:u,style:{width:"100%",minHeight:"280px"}},void 0,!1,{fileName:"/home/runner/workspace/client/components/service-tracking-map.tsx",lineNumber:123,columnNumber:7},this)},void 0,!1,{fileName:"/home/runner/workspace/client/components/service-tracking-map.tsx",lineNumber:122,columnNumber:5},this)}export{y as default};
