import numpy as np
from PIL import Image
from scipy import ndimage as nd
im=np.asarray(Image.open('/tmp/cg-mask/assets/pulse/pulse-bg-1190.jpg').convert('RGB')).astype(float)
H,W,_=im.shape
lum=im.max(2)
# strands = bright relative to local background
bg=nd.uniform_filter(lum,41)
strand=(lum-bg>26)|(lum>200)
strand=nd.binary_dilation(strand,iterations=1)
k=0.954
u,v=np.meshgrid(np.arange(1040),np.arange(520))
x=np.clip((605+(u-520)/k).round().astype(int),0,W-1)
y=np.clip((262+(v-260)/k).round().astype(int),0,H-1)
m=~strand[y,x]
ramp=np.clip((v-262)/30.0,0,1)  # drop the flat inner (back) line, soft edge
a=nd.gaussian_filter(m.astype(float),1.2)*ramp
out=np.zeros((520,1040,4),np.uint8); out[...,3]=(a*255).astype(np.uint8); out[...,:3]=255
Image.fromarray(out).save('/tmp/cg-mask/assets/pulse/pulse-bolt-mask.png',optimize=True)
print(a.mean())
