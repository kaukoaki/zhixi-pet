"""Reproduce the pinned GPU model by folding constant quantized weights.

Requires ONNX 1.17.0. This transforms model constants only; no image is read.
The original pinned OpenCV model, tensor contract and math are preserved.
"""
from pathlib import Path
import json,hashlib,numpy as np
R=Path(__file__).resolve().parent.parent
import onnx
source=R/'.cache/models/lama/inpainting_lama_2025jan.onnx';target=source.with_name('inpainting_lama_2025jan-float.onnx');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();assert sha(source)=='7df918ac3921d3daf0aae1d219776cf0dc4e4935f035af81841b40adcf74fdf2';model=onnx.load(source);initial={v.name:v for v in model.graph.initializer};keep=[];folded=[]
for node in model.graph.node:
 if node.op_type!='DequantizeLinear':keep.append(node);continue
 assert all(k in initial for k in node.input);w,scale,zero=[onnx.numpy_helper.to_array(initial[k]) for k in node.input];attrs={a.name:a.i for a in node.attribute};axis=attrs.get('axis',1)%w.ndim;block=attrs.get('block_size',0);assert block in (7,8) and scale.dtype==np.float32 and zero.dtype==w.dtype
 expected=list(w.shape);expected[axis]=(expected[axis]+block-1)//block;assert tuple(expected)==scale.shape==zero.shape
 select=[slice(None)]*w.ndim;select[axis]=slice(0,w.shape[axis]);scale=np.repeat(scale,block,axis=axis)[tuple(select)];zero=np.repeat(zero,block,axis=axis)[tuple(select)];out=(w.astype(np.float32)-zero.astype(np.float32))*scale;assert np.isfinite(out).all();folded.append(onnx.numpy_helper.from_array(out,node.output[0]))
used={name for node in keep for name in node.input}|{v.name for v in model.graph.output};values=[v for v in model.graph.initializer if v.name in used]+[v for v in folded if v.name in used];del model.graph.node[:];model.graph.node.extend(keep);del model.graph.initializer[:];model.graph.initializer.extend(values);onnx.checker.check_model(model);onnx.save(model,target);assert sha(target)=='8de2164d55c759b65ba69c2414baf1403fab172ba5c4f3f9167391780eb13b42';proof={'sourceSha256':sha(source),'derivedSha256':sha(target),'derivedBytes':target.stat().st_size,'foldedStaticWeightNodes':len(folded),'formula':'(float32(weight)-float32(repeat(zero,block_size,axis)))*repeat(scale,block_size,axis)','sourceImagesUploaded':False};target.with_suffix('.provenance.json').write_text(json.dumps(proof,indent=2),encoding='utf-8');print(json.dumps(proof),flush=True)
