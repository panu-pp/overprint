/* Overprint perk icons. Placeholder inline-SVG glyphs in a bold risograph style:
   flat spot-ink fill, drawn offset from a thick dark outline (misregistration).
   If icons/<key>.png exists it is used instead (<img> with onerror fallback to the SVG).
   API: ICONS.svg(key,ink)  ICONS.html(key,ink)  ICONS.rule(id,lv)  ICONS.rules (id -> rule data) */
(function(){
'use strict';
const INK={R:'var(--ink-r)',Y:'var(--ink-y)',B:'var(--ink-b)',X:'var(--ink-grey)',D:'var(--ink-dark)'};
const rect=(x,y,w,h)=>'M'+x+' '+y+'h'+w+'v'+h+'h'+(-w)+'z';
const circ=(x,y,r)=>'M'+(x-r)+' '+y+'a'+r+' '+r+' 0 1 0 '+2*r+' 0a'+r+' '+r+' 0 1 0 '+(-2*r)+' 0z';
const drop=(x,y,s)=>'M'+x+' '+(y-s)+'C'+(x+s*.5)+' '+(y-s*.3)+' '+(x+s*.8)+' '+(y+s*.1)+' '+(x+s*.8)+' '+(y+s*.4)+'A'+s*.8+' '+s*.8+' 0 0 1 '+(x-s*.8)+' '+(y+s*.4)+'C'+(x-s*.8)+' '+(y+s*.1)+' '+(x-s*.5)+' '+(y-s*.3)+' '+x+' '+(y-s)+'z';
const L=d=>'~'+d; // open stroke-only path
const skull=[circ(37,11,8),L('M34 10v2M40 10v2M35 15h4')]; // curse badge

// Shapes: string = closed (filled + outlined), '~...' = line only, {d,c} = shape with its own spot ink
const S={
 // ---- triggers
 open:[ 'M24 3L30 18L45 24L30 30L24 45L18 30L3 24L18 18z' ],
 clear:[ rect(3,17,12,14),rect(18,17,12,14),rect(33,17,12,14),L('M1 24H47') ],
 row:[ rect(3,17,42,14),L('M17 17v14M31 17v14') ],
 col:[ rect(17,3,14,42),L('M17 17h14M17 31h14') ],
 tint:[ rect(4,32,40,11),L('M16 32v11M28 32v11'),{d:drop(24,16,13),c:'R'} ],
 stuck:[ rect(6,6,36,36),L('M15 15L33 33M33 15L15 33') ],
 destroy:[ rect(8,8,32,32),L('M8 22L20 26L16 34L30 40') ],
 reink:[ drop(24,25,19),L('M24 24v10M19 29h10') ],
 // ---- generic
 arrow:[ L('M5 24H39M28 12L41 24L28 36') ],
 always:[ L('M24 24C20 12 5 12 5 24C5 36 20 36 24 24C28 12 43 12 43 24C43 36 28 36 24 24') ],
 // ---- effects
 shatter:[ rect(7,7,34,34),L('M7 20L21 25L16 33L30 41M32 7L28 17') ],
 reroll:[ rect(17,17,14,14),L('M8 22A17 17 0 0 1 36 11M29 5L37 11L30 17M40 26A17 17 0 0 1 12 37M19 43L11 37L18 31') ],
 bomb:[ circ(21,28,15),L('M30 16Q35 9 41 10M38 4L44 10M44 4L38 10') ],
 recolor:[ drop(24,25,19),L('M24 24v10M19 29h10') ],
 slide:[ rect(27,11,16,26),L('M21 24H4M11 17L4 24L11 31') ],
 golddust:[ circ(18,29,10),circ(33,19,7),L('M10 8v8M6 12h8M40 36v6M37 39h6') ],
 domino:[ rect(5,9,12,30),'M24 41L30 12L42 15L36 44z' ],
 echo:[ circ(14,24,7),L('M26 13A15 15 0 0 1 26 35M35 6A24 24 0 0 1 35 42') ],
 prism:[ 'M24 5L45 41H3z',L('M24 5V41M1 26H13') ],
 spark:[ 'M29 3L9 28H22L18 45L39 18H26z' ],
 siphon:[ {d:drop(16,17,12),c:'R'},{d:drop(32,32,12),c:'B'},L('M22 24L26 28') ],
 pebble:[ circ(24,26,12),L('M6 40l3-2M40 10l3-3M8 12h4') ],
 aftershock:[ rect(6,5,10,9),rect(32,5,10,9),L('M24 5V34M13 24L24 37L35 24M5 44H43') ],
 nudge:[ rect(4,16,17,17),L('M26 24H43M37 17L44 24L37 31') ],
 tilt:[ 'M9 21L29 11L40 31L20 42z',L('M3 46H45') ],
 turn:[ rect(14,15,20,20),L('M7 21A18 18 0 0 1 40 14M33 6L41 14L31 17') ],
 wetink:[ drop(24,25,19),L('M16 31Q20 26 24 31T32 31') ],
 thrift:[ circ(24,24,18),L('M24 12v24M17 20Q24 12 31 20T31 30') ],
 // ---- curses (each wears a small skull badge)
 curse_narrow:[ rect(5,7,24,34),L('M5 19H29M5 30H29'),{d:rect(32,7,10,34),c:'D'} ].concat(skull),
 curse_heavy:[ 'M12 20H32L38 42H6z',L('M17 20A5 5 0 0 1 27 20') ].concat(skull),
 curse_blot:[ 'M12 18C18 8 32 10 34 20C44 26 38 42 26 41C16 46 4 38 8 29C2 24 6 20 12 18z' ].concat(skull),
 curse_spill:[ 'M4 12H34V18H30V30A3 3 0 0 1 24 30V18H18V38A3 3 0 0 1 12 38V18H4z' ].concat(skull),
 curse_crease:[ rect(5,6,34,36),L('M5 25L15 20L24 29L39 22') ].concat(skull),
 curse_wetpatch:[ rect(5,7,15,15),rect(23,7,15,15),rect(5,25,15,15),{d:drop(30,34,10),c:'B'} ].concat(skull),
 curse_smudge:[ circ(15,26,11),circ(29,26,11),L('M10 44H34M28 39L34 44L28 47') ].concat(skull)
};

// ---- rules per perk id. t=trigger key, ti=trigger ink, e=effect key, ei=effect ink,
// n(lv)=current strength shown as xN. No t = passive (shown with an "always" marker).
const R={
 shatter:{t:'open',ti:'X',e:'shatter',ei:'Y',n:lv=>lv},
 reroll:{t:'stuck',ti:'X',e:'reroll',ei:'X'},
 bomb:{t:'tint',ti:'X',e:'bomb',ei:'R',n:lv=>lv},
 recolor:{t:'open',ti:'X',e:'recolor',ei:'R',n:lv=>lv},
 slide:{t:'col',ti:'X',e:'slide',ei:'B',n:lv=>lv},
 golddust:{t:'destroy',ti:'Y',e:'golddust',ei:'Y',n:lv=>lv+1},
 domino:{t:'clear',ti:'X',e:'domino',ei:'B',n:lv=>lv},
 echo:{t:'reink',ti:'R',e:'echo',ei:'R',n:lv=>lv},
 prism:{t:'tint',ti:'X',e:'prism',ei:'B',n:lv=>lv},
 spark:{t:'destroy',ti:'X',e:'spark',ei:'Y',n:lv=>'+'+10*lv},
 siphon:{t:'destroy',ti:'R',e:'siphon',ei:'B',n:lv=>lv},
 pebble:{t:'clear',ti:'X',e:'pebble',ei:'B',n:lv=>lv},
 aftershock:{t:'row',ti:'X',e:'aftershock',ei:'B',n:lv=>lv},
 nudge:{t:'open',ti:'X',e:'nudge',ei:'X',n:lv=>lv},
 tilt:{t:'tint',ti:'X',e:'tilt',ei:'B',n:lv=>lv},
 turn:{t:'stuck',ti:'X',e:'turn',ei:'Y',n:lv=>lv},
 wetink:{e:'wetink',ei:'B',n:lv=>Math.round(100*(0.2+0.1*lv))+'%'},
 thrift:{e:'thrift',ei:'Y'},
 narrow:{e:'curse_narrow',ei:'Y'},heavy:{e:'curse_heavy',ei:'Y'},blot:{e:'curse_blot',ei:'Y'},spill:{e:'curse_spill',ei:'Y'},
 crease:{e:'curse_crease',ei:'Y'},wetpatch:{e:'curse_wetpatch',ei:'Y'},smudge:{e:'curse_smudge',ei:'Y'}
};

const ink=c=>INK[c]||c||INK.X;
function svg(key,c){
  const shapes=S[key]||[circ(24,24,16),L('M24 16v10M24 31v2')];
  let fill='',line='';
  shapes.forEach(s=>{
    const o=typeof s==='string'?{d:s}:s;const ln=o.d.charAt(0)==='~';const d=ln?o.d.slice(1):o.d;const col=ink(o.c||c);
    if(ln)fill+='<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="5"/>';
    else fill+='<path d="'+d+'" fill="'+col+'" stroke="'+col+'" stroke-width="3"/>';
    line+='<path d="'+d+'"/>';
  });
  return '<svg class="ic-svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><g transform="translate(2.2 1.8)" stroke-linejoin="round" stroke-linecap="round">'+fill
    +'</g><g fill="none" stroke="var(--ink-dark)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">'+line+'</g></svg>';
}
const png={}; // key -> true (loaded) / false (missing); undefined = not tried yet
function html(key,c){
  const inner=(png[key]===false||!api.usePng)?svg(key,c):'<img class="ic-img" src="icons/'+key+'.png" alt="" draggable="false" data-k="'+key+'" data-i="'+(c||'')+'" onerror="ICONS.miss(this)" onload="ICONS.hit(this)">';
  return '<span class="ico" data-ic="'+key+'">'+inner+'</span>';
}
function miss(img){png[img.dataset.k]=false;const p=img.parentNode;if(p)p.innerHTML=svg(img.dataset.k,img.dataset.i)}
function hit(img){png[img.dataset.k]=true}
// rule markup for a perk at a given level: [trigger] -> [effect] xN   (or [effect] + "always" marker for passives)
function rule(id,lv){
  const r=R[id];if(!r)return '';lv=lv||1;
  let h='<span class="rule">';
  if(r.t)h+=html(r.t,r.ti)+'<span class="ico ar">'+svg('arrow','D')+'</span>';
  h+=html(r.e,r.ei);
  if(r.n){const n=r.n(lv);h+='<b class="xn">'+(typeof n==='number'?'×':'')+n+'</b>'}
  if(!r.t&&!/^curse_/.test(r.e))h+='<span class="ico al">'+svg('always','D')+'</span>';
  return h+'</span>';
}
const api={svg,html,rule,rules:R,shapes:S,png,miss,hit,usePng:true};
window.ICONS=api;
})();
