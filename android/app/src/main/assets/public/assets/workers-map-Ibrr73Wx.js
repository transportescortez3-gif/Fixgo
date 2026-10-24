import{a as s,e as r}from"./react-vendor-DPsuY2Bf.js";import{L as e}from"./maps-vendor-DnRLxOut.js";import{N as k}from"./navigation-BGwTFwVd.js";import"./index-BqylRYnR.js";import"./query-vendor-D3QgdFFn.js";import"./ui-vendor-CnZy54Fi.js";import"./socket-vendor-B1V2wiQG.js";import"./firebase-vendor-DvpHeU1-.js";const w=e.divIcon({className:"custom-marker",html:`<div style="
    width: 40px; height: 40px;
    background: hsl(221 83% 53%);
    border: 3px solid #fff;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    font-size: 18px;
  ">📍</div>`,iconSize:[40,40],iconAnchor:[20,40],popupAnchor:[0,-40]}),A=e.divIcon({className:"custom-marker",html:`<div style="
    width: 36px; height: 36px;
    background: #1a1a1a;
    border: 3px solid hsl(221 83% 53%);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    font-size: 16px;
  ">🔧</div>`,iconSize:[36,36],iconAnchor:[18,36],popupAnchor:[0,-36]}),$=e.divIcon({className:"custom-marker",html:`<div style="
    width: 36px; height: 36px;
    background: #1a1a1a;
    border: 3px solid #666;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    font-size: 16px;
    opacity: 0.7;
  ">🔧</div>`,iconSize:[36,36],iconAnchor:[18,36],popupAnchor:[0,-36]});function V({workers:l,userLat:o,userLng:n,onWorkerClick:p,className:h}){const c=s.useRef(null),a=s.useRef(null),b=s.useCallback(()=>{a.current&&a.current.setView([o,n],13,{animate:!0})},[o,n]);return s.useEffect(()=>{if(!c.current)return;a.current&&a.current.remove();const i=e.map(c.current,{center:[o,n],zoom:13,zoomControl:!1});e.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',maxZoom:19}).addTo(i),e.control.zoom({position:"bottomright"}).addTo(i),e.marker([o,n],{icon:w}).addTo(i).bindPopup(`
        <div style="font-family: system-ui; text-align: center; padding: 4px;">
          <strong style="font-size: 14px;">Tu ubicación</strong>
        </div>
      `);const d=e.latLngBounds([[o,n]]);return l.forEach(t=>{if(t.lat===null||t.lng===null)return;const m=t.category?.icon,f=t.isAvailable?"hsl(221 83% 53%)":"#666",g=t.isAvailable?"1":"0.7",v=m?e.divIcon({className:"custom-marker",html:`<div style="
              width: 36px; height: 36px;
              background: #1a1a1a;
              border: 3px solid ${f};
              border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              font-size: 18px;
              opacity: ${g};
              line-height: 1;
            ">${m}</div>`,iconSize:[36,36],iconAnchor:[18,36],popupAnchor:[0,-36]}):t.isAvailable?A:$,y=t.rating?"⭐ "+t.rating.toFixed(1):"Nuevo",u=t.distanceKm!=null?`${t.distanceKm.toFixed(1)} km`:"",x=t.skills?t.skills.split(",").slice(0,2).map(N=>N.trim()).join(", "):"",z=e.marker([t.lat,t.lng],{icon:v}).addTo(i).bindPopup(`
          <div style="font-family: system-ui; min-width: 160px; padding: 4px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <div style="
                width: 32px; height: 32px;
                background: hsl(221 83% 53% / 0.15);
                color: hsl(221 83% 53%);
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-weight: bold; font-size: 13px;
              ">${t.name.substring(0,2).toUpperCase()}</div>
              <div>
                <strong style="font-size: 13px; display: block;">${t.name}</strong>
                <span style="font-size: 11px; color: #999;">${y} (${t.totalReviews})</span>
              </div>
            </div>
            ${u?`<div style="font-size: 11px; color: #aaa; margin-bottom: 4px;">📍 A ${u}</div>`:""}
            ${x?`<div style="font-size: 11px; color: #ccc;">${x}</div>`:""}
            <div style="
              margin-top: 8px;
              padding: 4px 0;
              text-align: center;
              font-size: 11px;
              font-weight: 600;
              color: ${t.isAvailable?"#22c55e":"#999"};
            ">${t.isAvailable?"● Disponible":"● Ocupado"}</div>
          </div>
        `);p&&z.on("click",()=>p(t.id)),d.extend([t.lat,t.lng])}),l.some(t=>t.lat!==null&&t.lng!==null)&&i.fitBounds(d,{padding:[40,40],maxZoom:15}),a.current=i,()=>{i.remove(),a.current=null}},[l,o,n]),r.jsxDEV("div",{"data-replit-metadata":"runner/workspace/client/components/workers-map.tsx:198:4","data-component-name":"div",style:{position:"relative",width:"100%",minHeight:"300px"},children:[r.jsxDEV("div",{"data-replit-metadata":"runner/workspace/client/components/workers-map.tsx:199:6","data-component-name":"div",ref:c,className:h,style:{width:"100%",height:"100%",minHeight:"300px"}},void 0,!1,{fileName:"/home/runner/workspace/client/components/workers-map.tsx",lineNumber:199,columnNumber:7},this),r.jsxDEV("button",{"data-replit-metadata":"runner/workspace/client/components/workers-map.tsx:204:6","data-component-name":"button",onClick:b,style:{position:"absolute",bottom:56,right:10,zIndex:1e3,width:36,height:36,borderRadius:"50%",background:"rgba(26,26,26,0.85)",border:"1.5px solid rgba(234,179,8,0.5)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.4)",cursor:"pointer",backdropFilter:"blur(6px)"},title:"Volver a mi ubicación",children:r.jsxDEV(k,{"data-replit-metadata":"runner/workspace/client/components/workers-map.tsx:215:8","data-component-name":"Navigation",style:{width:16,height:16,color:"#2563EB"}},void 0,!1,{fileName:"/home/runner/workspace/client/components/workers-map.tsx",lineNumber:215,columnNumber:9},this)},void 0,!1,{fileName:"/home/runner/workspace/client/components/workers-map.tsx",lineNumber:204,columnNumber:7},this)]},void 0,!0,{fileName:"/home/runner/workspace/client/components/workers-map.tsx",lineNumber:198,columnNumber:5},this)}export{V as default};
