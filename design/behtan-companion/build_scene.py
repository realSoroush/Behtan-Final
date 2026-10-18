"""Author Behtan's vector rig. Stdlib only; run, then `rive . --once`.
The SVG is the same geometry, an accessible no-motion / load-failure fallback.
No raster layers, scripts, external assets or shaders inside the .riv.
"""
from pathlib import Path
import math
import copy
import xml.etree.ElementTree as E

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
counter = 100
ids = {}
svg_defs = E.Element('defs')

def el(tag, **attrs):
    return E.Element(tag, {k: str(v) for k, v in attrs.items()})

def ident(name):
    global counter
    if name not in ids:
        counter += 1
        ids[name] = f'0:{counter}'
    return ids[name]

def node(name, children, x=0, y=0, rotation=0, opacity=1, bind=False):
    r = el('Node', name=name, id=ident(name), x=x, y=y, rotation=rotation, opacity=opacity)
    s = el('g', transform=f'translate({x} {y}) rotate({rotation*180/math.pi})', opacity=opacity)
    if bind:
        r.append(el('DataBindContext', sourcePathIds='0:40-0:43', propertyKey=13))
        r.append(el('DataBindContext', sourcePathIds='0:40-0:44', propertyKey=14))
    for a, b in reversed(children): r.append(a)
    for a, b in children: s.append(b)
    return r, s

def paint(stops, coords=(0,0,0,500), radial=False):
    # Rive and SVG share coordinates and colors.
    global counter
    counter += 1
    gid = f'g{counter}'
    tag = 'RadialGradient' if radial else 'LinearGradient'
    g = el(tag, startX=coords[0], startY=coords[1], endX=coords[2], endY=coords[3])
    if radial:
        sg = el('radialGradient', id=gid, gradientUnits='userSpaceOnUse', cx=coords[0], cy=coords[1], r=math.hypot(coords[2]-coords[0], coords[3]-coords[1]))
    else:
        sg = el('linearGradient', id=gid, gradientUnits='userSpaceOnUse', x1=coords[0],y1=coords[1],x2=coords[2],y2=coords[3])
    for pos,col in stops:
        g.append(el('GradientStop', position=pos, colorValue=col))
        sg.append(el('stop', offset=pos, **{'stop-color':'#'+col[2:], 'stop-opacity':int(col[:2],16)/255}))
    svg_defs.append(sg)
    return g, f'url(#{gid})'

def shape(name, points=None, ellipse=None, stops=None, coords=(0,0,0,500), radial=False, stroke=None, closed=True):
    r = el('Shape', name=name, id=ident(name))
    if ellipse:
        x,y,w,h=ellipse
        r.set('x',str(x)); r.set('y',str(y))
        r.append(el('Ellipse', width=w,height=h,originX=.5,originY=.5))
        s=el('ellipse', cx=0,cy=0,rx=w/2,ry=h/2,transform=f'translate({x} {y})')
    else:
        # points: start xy then cubic control1 xy control2 xy end xy.
        start=points[0]; segs=points[1:]
        verts=[{'xy':start,'in':start,'out':start}]
        for c1x,c1y,c2x,c2y,ex,ey in segs:
            verts[-1]['out']=(c1x,c1y)
            verts.append({'xy':(ex,ey),'in':(c2x,c2y),'out':(ex,ey)})
        if closed and verts[-1]['xy']==start:
            verts[0]['in']=verts[-1]['in']; verts.pop()
        p=el('PointsPath',isClosed=str(closed).lower(),isClockwise='true')
        for v in verts:
            x,y=v['xy']; ix,iy=v['in']; ox,oy=v['out']
            p.append(el('CubicDetachedVertex',x=x,y=y,inRotation=math.atan2(iy-y,ix-x),inDistance=math.hypot(ix-x,iy-y),outRotation=math.atan2(oy-y,ox-x),outDistance=math.hypot(ox-x,oy-y)))
        r.append(p)
        d=f'M {start[0]} {start[1]} '+' '.join('C '+' '.join(map(str,z)) for z in segs)+(' Z' if closed else '')
        s=el('path',d=d)
    if stops:
        g,fill=paint(stops,coords,radial)
        f=el('Fill'); f.append(g); r.append(f);s.set('fill',fill)
    else:s.set('fill','none')
    if stroke:
        color,width=stroke
        st=el('Stroke',thickness=width,cap='round',join='round'); st.append(el('SolidColor',colorValue=color)); r.append(st)
        s.set('stroke','#'+color[2:]);s.set('stroke-width',str(width));s.set('stroke-linecap','round')
    return r,s

ivory=[(0,'FFFFFCEF'),(.5,'FFF8EFD9'),(1,'FFD9CBAE')]
teal=[(0,'FF86E0CF'),(.38,'FF38C3BD'),(.75,'FF119AA7'),(1,'FF087380')]
dark=[(0,'FF625044'),(.45,'FF352C29'),(1,'FF1F2524')]

# Local limb coordinates make the shoulder a genuine pivot.
arm=[(0,0),(20,-12,29,4,26,29),(24,57,4,105,-19,108),(-46,110,-43,82,-31,56),(-23,39,-12,11,0,0)]
near_arm=node('NearArm',[shape('NearFlipper',points=arm,stops=[(0,'FFFFF9E8'),(.58,'FFF3E4C5'),(1,'FFBFB397')],coords=(-8,28,45,79),radial=True)],x=152,y=328)
far_arm=node('FarArm',[shape('FarFlipper',points=[(0,0),(23,12,48,59,40,85),(36,103,16,105,9,83),(1,58,-15,14,0,0)],stops=ivory,coords=(2,25,45,75))],x=387,y=330)

body=shape('Body',points=[(302,64),(330,56,348,72,343,95),(338,108,323,107,312,104),(356,109,385,157,389,199),(395,244,361,257,368,282),(374,306,408,349,415,397),(427,465,377,511,306,522),(235,534,149,522,122,476),(92,426,106,378,122,342),(140,304,159,289,149,266),(122,229,125,195,145,155),(175,98,249,64,302,64)],stops=[(0,'FFD9F779'),(.19,'FFB8E84B'),(.47,'FF56B66B'),(.72,'FF25B5A7'),(1,'FF087B91')],coords=(173,71,326,531))
face=shape('IvorySweep',points=[(312,105),(350,106,381,149,386,193),(394,233,364,258,368,280),(371,304,398,335,405,372),(429,437,396,485,345,504),(375,474,384,437,373,408),(358,366,332,342,294,319),(253,292,213,280,205,250),(189,217,205,172,234,141),(259,114,284,99,312,105)],stops=[(0,'FFFFFCEF'),(.58,'FFF8EFD9'),(1,'FFDBCAA9')],coords=(283,184,439,278),radial=True)
belly=shape('TurquoiseSweep',points=[(231,302),(267,321,324,336,352,376),(382,418,365,471,325,492),(279,521,218,521,184,499),(161,482,167,453,185,432),(204,408,246,399,254,376),(265,343,247,324,231,302)],stops=[(0,'FF8DDFCF'),(.28,'FF46CABC'),(.65,'FF16ADAC'),(1,'FF077A8D')],coords=(234,371,391,480),radial=True)
# Broad soft gradients give volume without bitmap lighting or runtime shaders.
body_rim=shape('BodySoftLight',points=[(302,64),(330,56,348,72,343,95),(338,108,323,107,312,104),(356,109,385,157,389,199),(395,244,361,257,368,282),(374,306,408,349,415,397),(427,465,377,511,306,522),(235,534,149,522,122,476),(92,426,106,378,122,342),(140,304,159,289,149,266),(122,229,125,195,145,155),(175,98,249,64,302,64)],stops=[(0,'35FFFFFF'),(.55,'06FFFFFF'),(1,'00FFFFFF')],coords=(183,133,370,290),radial=True)

def eye(name,x,y,w,h):
    return node(name,[shape(name+'Shadow',ellipse=(1,3,w+10,h+10),stops=[(0,'3F53432D'),(.5,'2053432D'),(1,'0053432D')],coords=(0,0,21,0),radial=True),shape(name+'Orb',ellipse=(0,0,w,h),stops=dark,coords=(-5,-9,9,16)),shape(name+'Glint',ellipse=(-3,-7,5,7),stops=[(0,'FFFDFDF4'),(1,'99FDFDF4')],coords=(0,-10,0,0))],x=x,y=y)
eyes=node('Gaze',[eye('NearEye',270,192,25,33),eye('FarEye',350,183,20,29)],bind=True)
mouth=node('Mouth',[shape('Smile',points=[(-14,0),(-6,8,10,9,18,-3)],stroke=('FF594331',4.5),closed=False)],x=314,y=215)
cheeks=node('Cheeks',[shape('NearCheek',ellipse=(246,221,26,15),stops=[(0,'35EAAE78'),(1,'00EAAE78')],coords=(0,0,14,0),radial=True),shape('FarCheek',ellipse=(371,206,17,12),stops=[(0,'25EAAE78'),(1,'00EAAE78')],coords=(0,0,10,0),radial=True)])
face_rig=node('FaceRig',[cheeks,eyes,mouth],x=0,y=0)
feet=[node('NearFoot',[shape('NearFootShape',points=[(-40,0),(-35,-23,9,-28,32,-13),(51,1,45,23,22,24),(-6,27,-50,23,-40,0)],stops=teal,coords=(-15,-20,18,28))],x=202,y=532),node('FarFoot',[shape('FarFootShape',points=[(-35,0),(-30,-22,6,-26,27,-10),(42,7,40,21,18,22),(-8,26,-43,23,-35,0)],stops=teal,coords=(-15,-20,20,25))],x=324,y=529)]
# A contour-clipped volume wash: a soft light and a dark lateral edge.
rim_r=copy.deepcopy(body[0]);rim_s=copy.deepcopy(body[1])
rim_r.set('name','ContourShade');rim_r.set('id',ident('ContourShade'))
for child in list(rim_r):
    if child.tag=='Fill':rim_r.remove(child)
g,col=paint([(0,'00084441'),(.52,'00084441'),(.8,'22084441'),(1,'75064440')],(250,258,454,327),True)
f=el('Fill');f.append(g);rim_r.append(f);rim_s.set('fill',col)
contour=(rim_r,rim_s)
# Shoulder contact shade sits on the torso, underneath the articulated flipper.
shoulder=shape('ShoulderShade',ellipse=(145,384,83,142),stops=[(0,'3F314C36'),(.6,'15314C36'),(1,'00314C36')],coords=(0,0,66,0),radial=True)
shoulder[0].append(el('ClippingShape',sourceId=ids['Body']))
clip=el('clipPath',id='bodyClip');clip.append(copy.deepcopy(body[1]));svg_defs.append(clip)
sg=el('g',**{'clip-path':'url(#bodyClip)'});sg.append(shoulder[1]);shoulder=(shoulder[0],sg)
art=node('Artwork',[far_arm,body,contour,body_rim,face,belly,shoulder,face_rig,near_arm],x=-260,y=-520)
rig=node('BodyRig',[art],x=260,y=520)
shadow=shape('Ground',ellipse=(260,554,259,28),stops=[(0,'29334D44'),(.6,'11334D44'),(1,'00334D44')],coords=(0,0,130,0),radial=True)

root=el('Rive',version=1,kind='fragment')
ab=el('Artboard',width=520,height=610,name='Behtan',id='0:2',defaultStateMachineId='0:7',styleId='0:5',viewModelId='0:40',viewModelInstanceId='0:41');root.append(ab)
ab.append(el('LayoutComponentStyle',name='Artboard Style',id='0:5'))
sv=el('svg',xmlns='http://www.w3.org/2000/svg',viewBox='0 0 520 610',fill='none');sv.append(svg_defs)
layers=[shadow,*reversed(feet),rig]
for r,s in reversed(layers):ab.append(r)
for r,s in layers:sv.append(s)

def condition(prop,value):
    c=el('TransitionViewModelCondition',opValue='equal');p=el('TransitionPropertyViewModelComparator');b=el('BindablePropertyNumber');b.append(el('DataBindContext',sourcePathIds=f'0:40-{prop}',propertyKey=636));p.append(b);c.append(p);c.append(el('TransitionValueNumberComparator',value=value));return c

sm=el('StateMachine',name='Companion',id='0:7');ab.append(sm)
layer=el('StateMachineLayer',name='Presence',id='0:8');sm.append(layer)
any_state=el('AnyState',x=0,y=-180);layer.append(any_state)
layer.append(el('ExitState',x=1400,y=-180))
entry=el('EntryState',x=0,y=0);entry.append(el('StateTransition',stateToId='0:1000'));layer.append(entry)
modes=['idle','welcome','listening','thinking','celebrate','calm','guide','rest']
for i,name in enumerate(modes):
    t=el('StateTransition',stateToId=f'0:{1000+i}',duration=220);t.append(condition('0:42',i));any_state.append(t)
    layer.append(el('AnimationState',animationId=f'0:{1100+i}',id=f'0:{1000+i}',x=180+i*180,y=80+(i%2)*140,reset='true'))

def animation(i,frames,values,loop=False):
    a=el('LinearAnimation',name=modes[i],id=f'0:{1100+i}',fps=60,duration=frames,loopValue='loop' if loop else 'oneShot')
    for (name,key),pairs in values.items():
        ko=el('KeyedObject',objectId=ident(name));kp=el('KeyedProperty',propertyKey=key)
        for frame,value in pairs:
            k=el('KeyFrameDouble',frame=frame,value=value,interpolationType='cubic');k.append(el('CubicEaseInterpolator',x1=.42,y1=0,x2=.58,y2=1));kp.append(k)
        ko.append(kp);a.append(ko)
    ab.append(a)

def base(frames):
    return {(n,k):[(0,v),(frames,v)] for n,k,v in [('BodyRig',15,0),('BodyRig',16,1),('BodyRig',17,1),('NearArm',15,0),('FarArm',15,0),('FaceRig',15,0),('Mouth',17,1),('Mouth',16,1),('NearEye',17,1),('FarEye',17,1)]}
for i in range(8):
    duration=[360,150,240,300,155,220,180,360][i];v=base(duration)
    if i==0:
        v[('BodyRig',17)]=[(0,1),(180,1.007),(360,1)]
        v[('NearArm',15)]=[(0,0),(180,-.025),(360,0)]
    if i==1:
        v[('NearArm',15)]=[(0,0),(24,2.1),(40,1.75),(58,2.18),(76,1.8),(94,2.1),(130,0),(150,0)]
        v[('BodyRig',15)]=[(0,0),(32,.045),(100,.025),(150,0)]
        v[('Mouth',16)]=[(0,1),(35,1.15),(120,1.15),(150,1)]
    if i==2:
        v[('BodyRig',15)]=[(0,0),(55,-.04),(180,-.04),(240,0)]
        v[('FarArm',15)]=[(0,0),(55,.15),(180,.15),(240,0)]
    if i==3:
        v[('NearArm',15)]=[(0,0),(45,-1.15),(245,-1.15),(300,0)]
        v[('BodyRig',15)]=[(0,0),(55,-.035),(245,-.035),(300,0)]
        v[('Mouth',16)]=[(0,1),(50,.65),(245,.65),(300,1)]
    if i==4:
        v[('NearArm',15)]=[(0,0),(24,.2),(48,2.1),(78,1.85),(105,2),(155,0)]
        v[('FarArm',15)]=[(0,0),(24,-.15),(48,-1.9),(105,-1.7),(155,0)]
        v[('BodyRig',17)]=[(0,1),(22,.965),(48,1.025),(80,.99),(115,1.005),(155,1)]
        v[('BodyRig',16)]=[(0,1),(22,1.025),(48,.98),(80,1.01),(155,1)]
        v[('Mouth',17)]=[(0,1),(45,1.65),(110,1.65),(155,1)]
    if i==5:
        v[('NearArm',15)]=[(0,0),(50,-.65),(150,-.65),(220,0)]
        v[('BodyRig',17)]=[(0,1),(75,.985),(140,1),(220,1)]
    if i==6:
        v[('FarArm',15)]=[(0,0),(35,-1.1),(120,-1.05),(180,0)]
        v[('BodyRig',15)]=[(0,0),(40,.03),(125,.03),(180,0)]
    for name in ['NearEye','FarEye']:
        v[(name,17)]=[(0,1),(110,1),(115,.08),(121,1),(duration,1)] if duration>125 else [(0,1)]
    if i==7:
        for name in ['NearEye','FarEye']:v[(name,17)]=[(0,.32),(360,.32)]
        v[('BodyRig',17)]=[(0,1),(180,1.004),(360,1)]
    animation(i,duration,v,loop=i in [0,3,7])

# A touch within the actual Rive artwork greets; host also supports keyboard.
listener=el('StateMachineListenerSingle',targetId=ids['Body'],listenerTypeValue='click',name='Greet on touch')
change=el('ListenerViewModelChange');b=el('BindablePropertyNumber',propertyValue=1);b.append(el('DataBindContext',sourcePathIds='0:40-0:42',propertyKey=636,direction='true'));change.append(b);listener.append(change);sm.append(listener)
vm=el('ViewModel',name='Companion',id='0:40',defaultInstanceId='0:41')
for num,name in [(42,'mode'),(43,'gazeX'),(44,'gazeY')]:vm.append(el('ViewModelPropertyNumber',name=name,id=f'0:{num}'))
instance=el('ViewModelInstance',name='Default',exports='true',id='0:41')
for num in [42,43,44]:instance.append(el('ViewModelInstanceNumber',propertyValue=0,viewModelPropertyId=f'0:{num}'))
vm.append(instance);root.append(vm)
E.indent(root)
(HERE/'scene.rml').write_text(E.tostring(root,encoding='unicode'))
out=ROOT/'public/mascot';out.mkdir(parents=True,exist_ok=True)
(out/'behtan-rest.svg').write_text(E.tostring(sv,encoding='unicode'))
print(f'Wrote vector rig with {len(ids)} named parts; modes: {", ".join(modes)}')
