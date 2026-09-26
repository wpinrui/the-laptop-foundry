// Source for decals/*.svg and decals.js. Every decal is one evenodd path; pieces never overlap
// except where a cut-out is intended. Text uses the block font G (cap height 6 units).
function buildDecals() {
const R2=v=>Math.round(v*100)/100;
class S{constructor(tf){this.p=[];this.b=[1e9,1e9,-1e9,-1e9];this.tf=tf||((x,y)=>[x,y]);}
 ext(x,y){const b=this.b;b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}
 poly(pts){pts=pts.map(([x,y])=>this.tf(x,y));pts.forEach(([x,y])=>this.ext(x,y));this.p.push('M'+pts.map(([x,y])=>R2(x)+' '+R2(y)).join('L')+'Z');return this;}
 rect(x,y,w,h){return this.poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);}
 ell(cx,cy,rx,ry){this.ext(cx-rx,cy-ry);this.ext(cx+rx,cy+ry);this.p.push(`M${R2(cx-rx)} ${R2(cy)}A${R2(rx)} ${R2(ry)} 0 1 0 ${R2(cx+rx)} ${R2(cy)}A${R2(rx)} ${R2(ry)} 0 1 0 ${R2(cx-rx)} ${R2(cy)}Z`);return this;}
 circ(cx,cy,r){return this.ell(cx,cy,r,r);}
 rrect(x,y,w,h,r){this.ext(x,y);this.ext(x+w,y+h);const a=`A${r} ${r} 0 0 1`;this.p.push(`M${R2(x+r)} ${R2(y)}H${R2(x+w-r)}${a} ${R2(x+w)} ${R2(y+r)}V${R2(y+h-r)}${a} ${R2(x+w-r)} ${R2(y+h)}H${R2(x+r)}${a} ${R2(x)} ${R2(y+h-r)}V${R2(y+r)}${a} ${R2(x+r)} ${R2(y)}Z`);return this;}
 raw(d,bb){this.p.push(d);this.ext(bb[0],bb[1]);this.ext(bb[2],bb[3]);return this;}
}
const G={
A:[4,[[1,3,2,1],[0,1,1,5],[3,1,1,5]],[[[0,1],[1,0],[3,0],[4,1]]]],
C:[4,[[0,0,4,1],[0,1,1,4],[0,5,4,1]]],
D:[4,[[0,0,3,1],[0,1,1,4],[0,5,3,1],[3,1,1,4]],[[[3,0],[4,1],[3,1]],[[3,5],[4,5],[3,6]]]],
E:[4,[[0,0,4,1],[0,1,1,4],[0,5,4,1],[1,2.5,2,1]]],
F:[4,[[0,0,4,1],[0,1,1,5],[1,2.5,2,1]]],
G:[4,[[0,0,4,1],[0,1,1,4],[0,5,4,1],[2,2.5,2,1],[3,3.5,1,1.5]]],
H:[4,[[0,0,1,6],[3,0,1,6],[1,2.5,2,1]]],
I:[1,[[0,0,1,6]]],
L:[4,[[0,0,1,5],[0,5,4,1]]],
M:[5,[[0,0,1,6],[4,0,1,6],[1,0,3,1],[2,1,1,3]]],
N:[4,[[0,0,1,6],[3,0,1,6]],[[[1,0],[3,4.2],[3,6],[1,1.8]]]],
O:[4,[[0,0,4,1],[0,5,4,1],[0,1,1,4],[3,1,1,4]]],
P:[4,[[0,0,4,1],[0,1,1,5],[3,1,1,2],[1,3,3,1]]],
R:[4,[[0,0,4,1],[0,1,1,5],[3,1,1,2],[1,3,3,1]],[[[1.6,4],[2.8,4],[4,6],[2.8,6]]]],
S:[4,[[0,0,4,1],[0,1,1,1.5],[0,2.5,4,1],[3,3.5,1,1.5],[0,5,4,1]]],
T:[4,[[0,0,4,1],[1.5,1,1,5]]],
U:[4,[[0,0,1,5],[3,0,1,5],[0,5,4,1]]],
V:[4,[],[[[0,0],[1,0],[2,4.4],[3,0],[4,0],[2.5,6],[1.5,6]]]],
X:[4,[],[[[0,0],[1.1,0],[2,2.1],[2.9,0],[4,0],[2.6,3],[4,6],[2.9,6],[2,3.9],[1.1,6],[0,6],[1.4,3]]]],
0:[4,[[0,0,4,1],[0,5,4,1],[0,1,1,4],[3,1,1,4]]],
1:[3,[[1.5,0,1,6],[0.5,0,1,1]]],
2:[4,[[0,0,4,1],[3,1,1,1.5],[0,2.5,4,1],[0,3.5,1,1.5],[0,5,4,1]]],
3:[4,[[0,0,4,1],[3,1,1,1.5],[1,2.5,3,1],[3,3.5,1,1.5],[0,5,4,1]]],
4:[4,[[0,0,1,2.5],[0,2.5,3,1],[3,0,1,6]]],
5:[4,[[0,0,4,1],[0,1,1,1.5],[0,2.5,3,1],[3,2.5,1,2.5],[0,5,4,1]]],
6:[4,[[0,0,4,1],[0,1,1,4],[1,2.5,3,1],[3,3.5,1,1.5],[0,5,4,1]]],
7:[4,[[0,0,4,1],[3,1,1,5]]],
8:[4,[[0,0,4,1],[0,1,1,4],[3,1,1,4],[1,2.5,2,1],[0,5,4,1]]],
9:[4,[[0,0,4,1],[0,1,1,1.5],[3,1,1,4],[0,2.5,3,1],[0,5,4,1]]],
'.':[1,[[0,5,1,1]]],'-':[2.5,[[0,2.5,2.5,1]]],' ':[2,[]]};
const tw=(str,h,tr=1)=>{let u=0;[...str].forEach((c,i)=>{u+=G[c][0]+(i?tr:0);});return u*h/6;};
function text(s,str,x,y,h,tr=1){const k=h/6;let cx=0;[...str].forEach((c,i)=>{const g=G[c];if(i)cx+=tr;
 for(const [rx,ry,rw,rh] of g[1]) s.rect(x+(cx+rx)*k,y+ry*k,rw*k,rh*k);
 for(const pl of (g[2]||[])) s.poly(pl.map(([px,py])=>[x+(cx+px)*k,y+py*k]));cx+=g[0];});return cx*k;}
const rad=a=>a*Math.PI/180;
const arc=(cx,cy,r,a0,a1,n=24)=>Array.from({length:n+1},(_,i)=>{const a=rad(a0+(a1-a0)*i/n);return [cx+r*Math.cos(a),cy+r*Math.sin(a)];});
const ngon=(cx,cy,r,n,rot=0)=>Array.from({length:n},(_,i)=>{const a=rad(rot+360*i/n);return [cx+r*Math.cos(a),cy+r*Math.sin(a)];});
const star=(cx,cy,R,r)=>Array.from({length:10},(_,i)=>{const a=rad(-90+36*i),q=i%2?r:R;return [cx+q*Math.cos(a),cy+q*Math.sin(a)];});
function clip(poly,f){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],fa=f(a),fb=f(b);if(fa>=0)out.push(a);if((fa>=0)!==(fb>=0)){const t=fa/(fa-fb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}return out;}
const bars=(s,x,y,h,seq,unit)=>{let cx=x;seq.forEach((w,i)=>{if(i%2===0)s.rect(cx,y,w*unit,h);cx+=w*unit;});return cx-x;};
const D=[];const add=(id,name,set,surface,size,eras,s)=>D.push({id,name,set,surface,size,eras,s});let s;
s=new S();s.poly([[0,52],[30,0],[60,52]]).poly([[30,16],[30,46],[47.3,46]]);add('a1-prism','Prism','company','lid',40,[2016,2026],s);
s=new S();s.circ(24,24,24).circ(28,20,16.5).circ(28,20,6.5);add('a2-orbit','Orbit','company','lid',40,[2016],s);
s=new S();s.poly([[0,0],[33,0],[48,15],[48,48],[0,48]]).poly([[36.5,0],[48,0],[48,11.5]]);add('a3-corner','Corner','company','lid',36,[2026],s);
s=new S();s.raw('M0 0H40V26Q40 44 20 52Q0 44 0 26Z',[0,0,40,52]).raw('M3.5 3.5H36.5V26Q36.5 41.6 20 48.3Q3.5 41.6 3.5 26Z',[0,0,0,0]).rect(8,8,24,5).poly([[8,31],[20,21],[32,31],[32,37.5],[20,27.5],[8,37.5]]);add('a4-crest','Crest','company','lid',44,[2006],s);
s=new S();s.circ(50,16,16).circ(50,16,11.5).circ(50,16,6.5);[[0,5],[5,13.8],[10,22.6]].forEach(([x0,y])=>{s.poly([[x0,y],[31,y],[31,y+4.4],[x0+3,y+4.4]]);s.poly([[100-x0,y],[69,y],[69,y+4.4],[97-x0,y+4.4]]);});add('a5-wingbadge','Wingbadge','company','lid',20,[2006],s);
s=new S();const V1=[[0,0],[9,0],[19,27],[29,0],[38,0],[23.5,38],[14.5,38]];s.poly(V1).poly(V1.map(([x,y])=>[x+18,y]));add('a6-twin-v','Twin V','company','lid',32,[2016],s);
s=new S();s.poly(ngon(26,22.52,26,6)).poly(ngon(26,22.52,19.5,6)).circ(26,22.52,12).rect(24,13.52,4,18);add('a7-hexbolt','Hexbolt','company','lid',40,[2006],s);
s=new S((x,y)=>[x+0.35*(14-y),y]);s.rect(0,0,44,14);text(s,'HAVOC',(44-tw('HAVOC',7))/2,3.5,7);s.rect(47,0,2.6,14).rect(51.6,3,2.6,11).rect(56.2,6,2.6,8);add('b1-havoc','Havoc','line','lid',8,[2006,2016],s);
s=new S();s.rect(0,0,6,6);const lw=text(s,'LEDGER',9,0,6);s.rect(0,8.5,9+lw,1);add('b2-ledger','Ledger','line','palm',5,[2016,2026],s);
s=new S();s.rrect(0,0,48,14,7).rrect(1.5,1.5,45,11,5.5).circ(9,7,2.8);text(s,'STUDIO',16,4,6);add('b3-studio','Studio','line','palm',5,[2026],s);
s=new S((x,y)=>[x+0.25*(6-y),y]);s.rect(0,0.5,8,1.2).rect(3,2.4,5,1.2).rect(5,4.3,3,1.2);text(s,'FLUX',10,0,6);add('b4-flux','Flux','line','bezel',3.5,[2026],s);
{const w=tw('TITAN',6,1.6)+12;s=new S();s.poly([[3,0],[w-3,0],[w,3],[w,11],[w-3,14],[3,14],[0,11],[0,3]]);text(s,'TITAN',6,4,6,1.6);add('b5-titan','Titan','line','bezel',4,[2006],s);}
s=new S();s.rrect(4,4,34,34,2.5).rrect(7,7,28,28,1.2);text(s,'HELIX',21-tw('HELIX',4)/2,11,4);text(s,'CPU',21-tw('CPU',10)/2,18.5,10);
[10,15.5,21,26.5,32].forEach(c=>{s.rect(c-1.2,0,2.4,3.2).rect(c-1.2,38.8,2.4,3.2).rect(0,c-1.2,3.2,2.4).rect(38.8,c-1.2,3.2,2.4);});add('c1-helix-cpu','Helix CPU','cert','palm',14,[2006,2016],s);
s=new S();s.rrect(0,0,50,26,3).circ(13,13,9.5).circ(13,13,6.5).circ(13,13,2.4);text(s,'GPU',26,8.5,9);add('c2-gpu-fan','GPU Fan','cert','palm',10,[2006,2016],s);
s=new S();s.circ(20,20,20).raw('M12 25Q12 8 30 7Q29 24 12 25Z',[0,0,0,0]);text(s,'ECO',20-tw('ECO',5)/2,28.5,5);add('c3-eco-leaf','Eco Leaf','cert','palm',12,[2016,2026],s);
s=new S();s.poly([[12,0],[28,0],[40,12],[40,28],[28,40],[12,40],[0,28],[0,12]]).poly([[13,2.5],[27,2.5],[37.5,13],[37.5,27],[27,37.5],[13,37.5],[2.5,27],[2.5,13]]).poly([[12,10],[20,16],[28,10],[28,14],[20,20],[12,14]]);text(s,'RUGGED',20-tw('RUGGED',5)/2,23,5);s.rect(12,31,16,1.6);add('c4-rugged','Rugged','cert','palm',14,[2006],s);
s=new S();s.rrect(0,0,36,36,4);[5,10,16,20,16,10,5].forEach((h,i)=>s.rect(4.8+i*4,14-h/2,2.4,h));text(s,'TUNED',18-tw('TUNED',5)/2,27,5);add('c5-tuned-audio','Tuned Audio','cert','palm',12,[2006,2016],s);
s=new S();s.rrect(0,0,40,26,2.5).rrect(2.4,2.4,35.2,21.2,1).poly([[11,13.5],[14,10.5],[18,14.5],[27,5.5],[30,8.5],[18,20.5]]).rect(17,26,6,2.4).rect(12,28.4,16,1.6);text(s,'VIVID',20-tw('VIVID',6)/2,32.5,6);add('c6-vivid-display','Vivid Display','cert','palm',14,[2016],s);
s=new S();s.rect(0,0,24,24).rect(2.5,2.5,19,19).poly([[6,12.5],[8.5,10],[11,12.5],[16.5,7],[19,9.5],[11,17.5]]);add('d1-conformity','Conformity','regulatory','bottom',8,[2006,2016,2026],s);
s=new S();[[25,155],[205,335]].forEach(([a0,a1])=>{const h=30,c=19,r1=10.5,r2=15.5,rm=13;s.poly([...arc(c,c,r2,a0,a1-h,16),[c+(r2+3)*Math.cos(rad(a1-h)),c+(r2+3)*Math.sin(rad(a1-h))],[c+rm*Math.cos(rad(a1)),c+rm*Math.sin(rad(a1))],[c+(r1-3)*Math.cos(rad(a1-h)),c+(r1-3)*Math.sin(rad(a1-h))],...arc(c,c,r1,a1-h,a0,16)]);});add('d2-recycle-loop','Recycle Loop','regulatory','bottom',9,[2006,2016,2026],s);
{s=new S();const L=Math.hypot(30,36),n=[36/L,-30/L],dist=p=>n[0]*p[0]+n[1]*p[1];
 for(const pc of [[[5,9],[25,9],[23,34],[7,34]],[[2,5],[28,5],[28,8],[2,8]],[[11,2],[19,2],[19,4],[11,4]]]){for(const f of [p=>dist(p)-3.2,p=>-dist(p)-3.2]){const c=clip(pc,f);if(c.length>2)s.poly(c);}}
 const hw=1.6;s.poly([[n[0]*hw,n[1]*hw],[30+n[0]*hw,36+n[1]*hw],[30-n[0]*hw,36-n[1]*hw],[-n[0]*hw,-n[1]*hw]]);add('d3-no-bin','No Bin','regulatory','bottom',10,[2006,2016,2026],s);}
s=new S();s.rect(0,11,6,2).rect(9,11,8,2).poly([...arc(26,12,9,40,320,28),...arc(26,12,6.8,320,40,28)]).circ(26,12,3).rect(29,11,14,2).poly([[49,6],[51,6],[51,11],[56,11],[56,13],[51,13],[51,18],[49,18],[49,13],[44,13],[44,11],[49,11]]);add('d4-polarity','Polarity','regulatory','bottom',6,[2006,2016,2026],s);
{s=new S();const L1=['MODEL NF-14A','SN 2006 0417 3381','INPUT 20V 3.25A'],h=3.2,W=Math.max(...L1.map(t=>tw(t,h)))+8;s.rrect(0,0,W,34,1.6).rrect(1.2,1.2,W-2.4,31.6,0.8);L1.forEach((t,i)=>text(s,t,4,4+i*5.5,h));bars(s,4,21.5,8.5,[2,1,1,1,3,1,1,2,1,1,2,1,3,1,1,1,2,2,1,1,1,3,2,1,1,1,2,1,3,1,1,2,1,1,2,1,1,1,3,1,2],0.62);add('d5-rating-plate','Rating Plate','regulatory','bottom',20,[2006,2016,2026],s);}
{s=new S();const w=bars(s,0,0,12,[1,1,3,1,1,2,2,1,1,1,3,2,1,1,2,1,1,3,1,1,2,2,1,1,3,1,1,1,2,1,1,2,3,1,1,1,2,1,1],0.7);const t='SN 04261187';text(s,t,(w-tw(t,3.6))/2,14.5,3.6);add('d6-serial-tag','Serial Tag','regulatory','bottom',10,[2006,2016,2026],s);}
s=new S();s.rect(0,0,10,80).rect(13,0,4,80);add('e1-twin-stripe','Twin Stripe','fun','lid',160,[2006],s);
s=new S();s.raw('M20 0Q29 13 25 23Q32 19 31 9Q42 22 39 36Q35 50 20 52Q5 50 2 37Q0 25 10 14Q9 22 14 25Q10 12 20 0Z',[0,0,42,52]).raw('M20 27Q27 35 26.5 41Q26 47 20 47Q14 47 13.5 41Q13.5 34 20 27Z',[0,0,0,0]);add('e2-flame','Flame','fun','lid',50,[2006],s);
s=new S();s.poly(star(18,20,18,7.5)).poly(star(44,10,9,3.8)).poly(star(46,34,7,3));add('e3-star-trio','Star Trio','fun','lid',40,[2016],s);
s=new S();s.rect(0,0,2.4,40).rect(4,1,30,20).rect(5.2,2.2,27.6,17.6);for(let i=0;i<6;i++)for(let j=0;j<4;j++)if((i+j)%2===0)s.rect(5.2+i*4.6,2.2+j*4.4,4.6,4.4);add('e4-checker-flag','Checker Flag','fun','lid',36,[2006],s);
s=new S();s.circ(20,3,3).rect(19,6,2,4).rrect(4,10,32,26,5).circ(13,21,4).circ(27,21,4).circ(14,21.5,1.6).circ(28,21.5,1.6).rrect(11,28,18,4,2).rect(15.9,28,1.4,4).rect(22.7,28,1.4,4).rect(0,18,2.5,10).rect(37.5,18,2.5,10);add('e5-bolt-robot','Bolt the Robot','fun','lid',40,[2016,2026],s);
s=new S();s.raw('M4 14L6 0L16 8Q22 6 28 8L38 0L40 14Q44 22 40 30Q34 40 22 40Q10 40 4 30Q0 22 4 14Z',[0,0,44,40]).ell(15,22,3,4.2).ell(29,22,3,4.2).ell(15,22,0.9,3).ell(29,22,0.9,3).poly([[20,28],[24,28],[22,30.5]]);add('e6-kiln-cat','Kiln the Cat','fun','lid',40,[2026],s);
return D.map(o=>{const b=o.s.b,vb=[R2(b[0]),R2(b[1]),R2(b[2]-b[0]),R2(b[3]-b[1])];return {id:o.id,name:o.name,set:o.set,surface:o.surface,size:o.size,eras:o.eras,vb,d:o.s.p.join('')};});
}
