"""Specialize the pinned float model to the fixed single-frame video contract.

Uses ONNX 1.17 reference evaluation to fold constant shape expressions.
Only model constants and dimensions are read; no character image is read.
"""
from pathlib import Path
import json,hashlib,numpy as np
R=Path(__file__).resolve().parent.parent
import onnx
from onnx.reference import ReferenceEvaluator
src=R/'.cache/models/lama/inpainting_lama_2025jan-float.onnx';dst=src.with_name('inpainting_lama_2025jan-fixed.onnx');sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();assert sha(src)=='8de2164d55c759b65ba69c2414baf1403fab172ba5c4f3f9167391780eb13b42';m=onnx.load(src)
for v in m.graph.input:v.type.tensor_type.shape.dim[0].dim_value=1
allowed={'Constant','Gather','Unsqueeze','Squeeze','Concat','Cast','Mul','Div','Add','Sub','Slice','Reshape','ConstantOfShape','Transpose','Expand'};folded=0
for iteration in range(20):
 m=onnx.shape_inference.infer_shapes(m,data_prop=True);known={v.name:onnx.numpy_helper.to_array(v) for v in m.graph.initializer};shapes={}
 for v in [*m.graph.input,*m.graph.value_info,*m.graph.output]:
  dims=v.type.tensor_type.shape.dim
  if dims and all(d.HasField('dim_value') for d in dims):shapes[v.name]=[d.dim_value for d in dims]
 keep=[];added=[]
 for n in m.graph.node:
  outputs=None
  if n.op_type=='Shape' and n.input[0] in shapes:
   shape=shapes[n.input[0]];attrs={a.name:a.i for a in n.attribute};outputs=[np.array(shape[attrs.get('start',0):attrs.get('end',len(shape))],np.int64)]
  elif n.op_type in allowed and all(not name or name in known for name in n.input) and sum(known[name].size for name in n.input if name)<=4096:
   outputs=ReferenceEvaluator(n,opsets={v.domain:v.version for v in m.opset_import}).run(None,{name:known[name] for name in n.input if name})
  if outputs is None:keep.append(n);continue
  for name,value in zip(n.output,outputs):known[name]=np.asarray(value);added.append(onnx.numpy_helper.from_array(np.asarray(value),name))
  folded+=1
 if not added:break
 del m.graph.node[:];m.graph.node.extend(keep);m.graph.initializer.extend(added)
 print('pass',iteration,'folded',len(added),flush=True)
remaining=[n.name for n in m.graph.node if n.op_type=='Shape'];assert not remaining,remaining
used={name for n in m.graph.node for name in n.input}|{v.name for v in m.graph.output};initial=[v for v in m.graph.initializer if v.name in used];del m.graph.initializer[:];m.graph.initializer.extend(initial)
for v in m.opset_import:
 if v.domain=='':v.version=17
onnx.checker.check_model(m);onnx.save(m,dst);assert sha(dst)=='d5d8aaf29a3fd1905bfe0042029ae0dafc4daf6d1cffea2dbc81e21d0dc02dd2';proof={'sourceSha256':sha(src),'derivedSha256':sha(dst),'derivedBytes':dst.stat().st_size,'fixedBatch':1,'foldedShapeNodes':folded,'opset':17,'sourceImagesUploaded':False};dst.with_suffix('.provenance.json').write_text(json.dumps(proof,indent=2),encoding='utf-8');print(json.dumps(proof),flush=True)
