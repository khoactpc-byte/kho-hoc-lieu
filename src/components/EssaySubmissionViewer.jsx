import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadEssaySubmissionFile } from '../services/essaySubmissionFile';
import { essayHasMarks, readEssayAnnotations, validateEssayAnnotations } from '../utils/essayAnnotations';
import { essayPointFromView, essayRotationLayout, normalizeEssayRotation } from '../utils/essayRotation';
import { FULL_ESSAY_CROP, essayCropFromPoints, essayCropLayout } from '../utils/essayCrop';
import { ESSAY_ZOOM_LEVELS, essayPageWidth, stepEssayZoom } from '../utils/essayZoom';
import EssayGradeStamp from './EssayGradeStamp';

function Mark({ mark }) {
  const p = mark.points[0];
  if (mark.kind === 'text') return <text x={p.x} y={p.y} fill={mark.color} fontSize="20" fontFamily="Arial,sans-serif">{mark.text}</text>;
  const points = mark.kind === 'tick' ? [{ x:p.x-12,y:p.y },{ x:p.x-3,y:p.y+10 },{ x:p.x+16,y:p.y-15 }] : mark.points;
  if (mark.kind === 'cross') return <path d={`M${p.x-12},${p.y-12}L${p.x+12},${p.y+12}M${p.x+12},${p.y-12}L${p.x-12},${p.y+12}`} stroke={mark.color} strokeWidth={mark.width} vectorEffect="non-scaling-stroke" />;
  if (points.length === 1) return <circle cx={p.x} cy={p.y} r={mark.width / 2} fill={mark.color} />;
  return <polyline points={points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={mark.color} strokeWidth={mark.width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
}

function PdfPage({ pdf, page, onReady, onError, onDimensions }) {
  const canvas = useRef(null);
  useEffect(() => {
    let active = true, render;
    onReady(false);
    pdf.getPage(page).then(source => {
      if (!active) return;
      const size = source.getViewport({ scale:1 });
      const viewport = source.getViewport({ scale:Math.min(1.8,1600/size.width) });
      onDimensions({width:viewport.width,height:viewport.height});
      canvas.current.width = Math.ceil(viewport.width); canvas.current.height = Math.ceil(viewport.height);
      render = source.render({ canvasContext:canvas.current.getContext('2d'),viewport });
      return render.promise.then(()=>{if(active) onReady(true);});
    }).catch(error=>{if(active && error.name !== 'RenderingCancelledException') onError('Chưa hiển thị được trang PDF. Hãy thử lại.');});
    return ()=>{active=false;render?.cancel();};
  },[pdf,page,onReady,onError,onDimensions]);
  return <canvas ref={canvas} role="img" aria-label={`Trang ${page} của bài PDF`} />;
}

export default function EssaySubmissionViewer({ submission, value, onChange, disabled = false, loadFile = loadEssaySubmissionFile, toolbarTarget, toolsOpen = true, reviewStamp }) {
  const [source,setSource]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[progress,setProgress]=useState(0),[attempt,setAttempt]=useState(0);
  const [page,setPage]=useState(1),[zoom,setZoom]=useState('fit'),[ready,setReady]=useState(false);
  const scrollRef=useRef(null),[viewport,setViewport]=useState({width:0,height:0});
  const [rotations,setRotations]=useState({}),[dimensions,setDimensions]=useState({width:1,height:1});
  const [crops,setCrops]=useState({}),[cropping,setCropping]=useState(false),[cropSelection,setCropSelection]=useState(null);
  const cropAnchor=useRef(null);
  const [tool,setTool]=useState('pan'),[color,setColor]=useState('#dc2626'),[width,setWidth]=useState(3),[note,setNote]=useState('');
  const [live,setLive]=useState(null),[redo,setRedo]=useState([]),[markError,setMarkError]=useState('');
  const activeStroke=useRef(null);
  const annotations=readEssayAnnotations(value,submission), marks=annotations.pages[page] || [];
  const editable=!!onChange && !disabled;
  const rotation=rotations[page] || 0, crop=cropping ? FULL_ESSAY_CROP : crops[page] || FULL_ESSAY_CROP;
  const cropWidth=crop.right-crop.left,cropHeight=crop.bottom-crop.top;
  const layout=essayRotationLayout(dimensions.width*cropWidth,dimensions.height*cropHeight,rotation);
  const cancelCrop=()=>{cropAnchor.current=null;setCropping(false);setCropSelection(null);};
  const rotate=turns=>{activeStroke.current=null;setLive(null);setRotations(current=>({...current,[page]:normalizeEssayRotation(rotation+turns)}));};
  useEffect(()=>{
    if(!toolbarTarget || toolsOpen)return;
    activeStroke.current=null;cropAnchor.current=null;setLive(null);setTool('pan');setCropping(false);setCropSelection(null);
  },[toolbarTarget,toolsOpen]);
  useEffect(()=>{
    const controller=new AbortController(); let objectUrl,loadingTask,active=true;
    setSource(null);setError('');setNotice('');setProgress(0);setReady(false);setPage(1);setRotations({});setDimensions({width:1,height:1});setCrops({});cropAnchor.current=null;setCropping(false);setCropSelection(null);
    loadFile({id:submission.id,fileId:submission.fileId,submittedAt:submission.submittedAt,schoolCode:submission.schoolCode,schoolYear:submission.schoolYear,grade:submission.grade,subject:submission.subject},{signal:controller.signal,onProgress:n=>{if(active)setProgress(n);},onNotice:message=>{if(active)setNotice(message);}}).then(async blob=>{
      if(!active)return;
      if(blob.type==='application/pdf') {
        const [{getDocument,GlobalWorkerOptions},{default:workerSrc}]=await Promise.all([import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
        if(!active)return;
        GlobalWorkerOptions.workerSrc=workerSrc;
        const bytes=new Uint8Array(await blob.arrayBuffer());if(!active)return;
        loadingTask=getDocument({data:bytes,isEvalSupported:false});
        const pdf=await loadingTask.promise;
        if(!active)return;
        if(pdf.numPages>100)throw new Error('Bài có hơn 100 trang. Mở tệp gốc để xem.');
        setSource({pdf,count:pdf.numPages});
      } else { objectUrl=URL.createObjectURL(blob);setSource({url:objectUrl,count:1}); }
    }).catch(e=>{if(active && e.name!=='AbortError')setError(e.message || 'Chưa tải được bài làm.');});
    return ()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);loadingTask?.destroy();};
  },[submission.id,submission.fileId,submission.submittedAt,submission.schoolCode,submission.schoolYear,submission.grade,submission.subject,attempt,loadFile]); // File identity, not incoming grade edits, controls reloading.
  useEffect(()=>{
    const container=scrollRef.current;if(!container)return;
    const measure=()=>{const style=window.getComputedStyle(container);setViewport({width:container.clientWidth-parseFloat(style.paddingLeft || 0)-parseFloat(style.paddingRight || 0),height:container.clientHeight-parseFloat(style.paddingTop || 0)-parseFloat(style.paddingBottom || 0)});};
    measure();
    const observer=typeof ResizeObserver==='function' ? new ResizeObserver(measure) : null;
    observer?.observe(container);window.addEventListener('resize',measure);
    return ()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[source]);
  const update=next=>{
    try {const clean=validateEssayAnnotations({...annotations,pages:{...annotations.pages,[page]:next}},submission);onChange?.(clean);setMarkError('');return true;}
    catch(e){setMarkError(e.message);return false;}
  };
  const position=e=>{const r=e.currentTarget.getBoundingClientRect();return essayPointFromView((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height,rotation);};
  const cropStart=e=>{if(e.button!==0)return;e.preventDefault();cropAnchor.current=position(e);setCropSelection(null);e.currentTarget.setPointerCapture?.(e.pointerId);};
  const cropMove=e=>{if(cropAnchor.current)setCropSelection(essayCropFromPoints(cropAnchor.current,position(e)));};
  const cropFinish=e=>{if(cropAnchor.current)setCropSelection(essayCropFromPoints(cropAnchor.current,position(e)));cropAnchor.current=null;e.currentTarget.releasePointerCapture?.(e.pointerId);};
  const start=e=>{
    if(!editable || !ready || tool==='pan' || e.button!==0 || activeStroke.current)return;
    e.preventDefault();const p=position(e);
    if(tool==='erase') {const target=e.target.closest?.('[data-mark-index]');if(target && update(marks.filter((_,i)=>i!==Number(target.dataset.markIndex))))setRedo([]);return;}
    if(tool==='text' && !note.trim()){setMarkError('Nhập ghi chú rồi chạm vị trí muốn ghi trên bài.');return;}
    const next={kind:tool,color,width,points:[p],...(tool==='text'?{text:note.trim()}:{})};
    if(tool!=='pen'){if(update([...marks,next]))setRedo([]);return;}
    e.currentTarget.setPointerCapture?.(e.pointerId);activeStroke.current={...next,pointerId:e.pointerId};setLive(next);
  };
  const move=e=>{
    const stroke=activeStroke.current;if(!stroke || stroke.pointerId!==e.pointerId)return;
    const p=position(e),last=stroke.points.at(-1);
    if(Math.hypot(p.x-last.x,p.y-last.y)<2 || stroke.points.length>=1500)return;
    stroke.points.push(p);setLive({...stroke,points:[...stroke.points]});
  };
  const finish=e=>{
    const stroke=activeStroke.current;if(!stroke || stroke.pointerId!==e.pointerId)return;
    activeStroke.current=null;setLive(null);
    if(update([...marks,{kind:stroke.kind,color:stroke.color,width:stroke.width,points:stroke.points}]))setRedo([]);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const controls = <div className="essay-viewer-toolbar">
      <div className="essay-page-controls"><button type="button" aria-label="Trang trước" title="Trang trước" disabled={page<=1} onClick={()=>{cancelCrop();setReady(false);setPage(p=>p-1);setRedo([]);}}>‹</button><span>Trang {page}/{source?.count || 1}</span><button type="button" aria-label="Trang sau" title="Trang sau" disabled={!source || page>=source.count} onClick={()=>{cancelCrop();setReady(false);setPage(p=>p+1);setRedo([]);}}>›</button>
        </div>
      <div className="essay-rotation-controls" role="group" aria-label="Xoay trang bài làm">
        <button type="button" aria-label="Xoay trái 90 độ" title="Xoay trái 90°" disabled={!ready} onClick={()=>rotate(-1)}>↶ Xoay trái</button>
        <button type="button" aria-label="Xoay phải 90 độ" title="Xoay phải 90°" disabled={!ready} onClick={()=>rotate(1)}>↷ Xoay phải</button>
        <button type="button" aria-label="Đặt lại hướng trang" title="Trở về hướng gốc" disabled={!ready || !rotation} onClick={()=>rotate(-rotation)}>{rotation*90}°</button>
      </div>
      <div className="essay-crop-controls">
        {cropping ? <><p>Kéo chọn vùng bài làm, rồi bấm Áp dụng. Chỉ cắt vùng xem.</p><button type="button" disabled={!cropSelection} onClick={()=>{setCrops(current=>({...current,[page]:cropSelection}));cancelCrop();}}>Áp dụng vùng cắt</button><button type="button" onClick={cancelCrop}>Hủy cắt</button></> : <><button type="button" disabled={!ready} onClick={()=>{activeStroke.current=null;setLive(null);setCropSelection(crops[page] || null);setCropping(true);}}>✂ Cắt vùng xem</button>{crops[page] && <button type="button" onClick={()=>setCrops(current=>{const next={...current};delete next[page];return next;})}>Xem toàn trang</button>}</>}
      </div>
      {onChange && <><div className="essay-mark-tools" role="toolbar" aria-label="Công cụ chấm trên bài">
        {[['pan','Di chuyển'],['pen','Bút'],['tick','✓ Đúng'],['cross','✕ Sai'],['text','Ghi chú'],['erase','Tẩy']].map(([id,label])=><button key={id} type="button" aria-pressed={tool===id} disabled={!editable || !ready} onClick={()=>setTool(id)}>{label}</button>)}
      </div>
      <div className="essay-undo-row"><button type="button" disabled={!editable || !marks.length} onClick={()=>{if(update(marks.slice(0,-1)))setRedo(prev=>[...prev,marks.at(-1)]);}}>Hoàn tác</button>
      <details className="essay-tool-options"><summary>Màu và nét</summary><div>
        <label>Màu <select aria-label="Màu nét chấm" value={color} onChange={e=>setColor(e.target.value)} disabled={!editable}><option value="#dc2626">Đỏ</option><option value="#2563eb">Xanh dương</option><option value="#16a34a">Xanh lá</option></select></label>
        <label>Nét <select aria-label="Độ dày nét chấm" value={width} onChange={e=>setWidth(Number(e.target.value))} disabled={!editable}>{[2,3,5,8].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <button type="button" disabled={!editable || !redo.length} onClick={()=>{if(update([...marks,redo.at(-1)]))setRedo(prev=>prev.slice(0,-1));}}>Làm lại</button>
      </div></details></div>{tool==='text' && <input aria-label="Ghi chú trên bài" placeholder="Nhập ghi chú rồi chạm lên bài" value={note} maxLength={180} disabled={!editable} onChange={e=>setNote(e.target.value)} />}
        {tool==='erase' && <p className="teacher-inbox-note">Chạm vào nét muốn xóa.</p>}</>}
    </div>;
  return <section className="essay-viewer" aria-label="Xem và ghi chú bài tự luận">
    <div className="essay-zoom-controls" role="group" aria-label="Kích thước bài làm">
      <button type="button" aria-label="Thu nhỏ bài làm" title="Thu nhỏ bài làm" onClick={()=>setZoom(stepEssayZoom(zoom,-1,viewport,layout.aspectRatio))}>− Thu nhỏ</button>
      <select aria-label="Thu phóng bài làm" value={zoom} onChange={e=>setZoom(['fit','width'].includes(e.target.value)?e.target.value:Number(e.target.value))}><option value="fit">Vừa trang</option><option value="width">Vừa chiều ngang</option>{ESSAY_ZOOM_LEVELS.map(n=><option key={n} value={n}>{n}%</option>)}</select>
      <button type="button" aria-label="Phóng to bài làm" title="Phóng to bài làm" onClick={()=>setZoom(stepEssayZoom(zoom,1,viewport,layout.aspectRatio))}>+ Phóng to</button>
      <button type="button" aria-pressed={zoom==='fit'} onClick={()=>setZoom('fit')}>Vừa trang</button>
    </div>
    {toolbarTarget ? createPortal(controls,toolbarTarget) : controls}
    {markError && <p role="alert">{markError}</p>}
    {notice && !error && <p role="status" className="teacher-inbox-note">{notice}</p>}
    {value && (value.fileId!==submission.fileId || value.submittedAt!==(Number(submission.submittedAt)||0)) && <p role="alert">Tệp đã thay đổi. Nét chấm của tệp trước chưa được áp dụng lên bài này.</p>}
    {error ? <div className="essay-preview-error" role="alert"><p>{error}</p><button type="button" onClick={()=>setAttempt(n=>n+1)}>Thử tải lại bài</button>{/^https:\/\//i.test(submission.fileUrl || '') && <a href={submission.fileUrl} target="_blank" rel="noopener noreferrer">Mở tệp gốc</a>}</div>
      : !source ? <p role="status">Đang tải bài làm… {progress>0?`${progress}%`:''}</p>
      : <div className="essay-page-scroll" ref={scrollRef}><div className="essay-page-frame" style={{width:essayPageWidth(zoom,viewport,layout.aspectRatio),aspectRatio:layout.aspectRatio}}><div className="essay-page-rotation" data-rotation={rotation*90} style={{width:layout.width,transform:layout.transform,aspectRatio:dimensions.width*cropWidth/(dimensions.height*cropHeight)}}><div className="essay-page" data-rotation={rotation*90} style={essayCropLayout(crop)}>
        {source.pdf ? <PdfPage pdf={source.pdf} page={page} onReady={setReady} onError={setError} onDimensions={setDimensions} /> : <img src={source.url} alt={`Bài làm của ${submission.studentName || 'học sinh'}`} onLoad={event=>{const image=event.currentTarget;if(image.naturalWidth && image.naturalHeight)setDimensions({width:image.naturalWidth,height:image.naturalHeight});setReady(true);}} onError={()=>setError('Không đọc được ảnh bài làm.')} draggable={false} />}
        <svg className="essay-marks" aria-label="Nét chấm trên bài" viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{touchAction:editable && tool!=='pan'?'none':'auto',pointerEvents:editable && tool!=='pan'?'auto':'none'}} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{activeStroke.current=null;setLive(null);}}>
          {marks.map((mark,i)=><g key={i} data-mark-index={i}><Mark mark={mark} /></g>)}{live && <Mark mark={live} />}
        </svg>
        {cropping && <svg className="essay-crop-overlay" role="img" aria-label="Khoanh vùng bài làm" viewBox="0 0 1000 1000" preserveAspectRatio="none" onPointerDown={cropStart} onPointerMove={cropMove} onPointerUp={cropFinish} onPointerCancel={()=>{cropAnchor.current=null;}}>
          {cropSelection && <><path fill="#0f172a99" fillRule="evenodd" d={`M0 0H1000V1000H0Z M${cropSelection.left*1000} ${cropSelection.top*1000}H${cropSelection.right*1000}V${cropSelection.bottom*1000}H${cropSelection.left*1000}Z`}/><rect x={cropSelection.left*1000} y={cropSelection.top*1000} width={(cropSelection.right-cropSelection.left)*1000} height={(cropSelection.bottom-cropSelection.top)*1000} fill="none" stroke="#2563eb" strokeWidth="3" strokeDasharray="10 6" vectorEffect="non-scaling-stroke" /></>}
        </svg>}
      </div></div>{page===1 && reviewStamp && <EssayGradeStamp review={reviewStamp} className="essay-paper-grade"/>}</div></div>}
    {!onChange && essayHasMarks(annotations) && <p className="teacher-inbox-note">Nét chấm và ghi chú của giáo viên trên bài gốc.</p>}
  </section>;
}
