import { useState } from 'react';
import EssaySubmissionViewer from './EssaySubmissionViewer';
import TeacherEssayReview from './TeacherEssayReview';
import { sameEssayAnnotations } from '../utils/essayAnnotations';

export default function EssayGradingPanel(props) {
  const {submission,draft={},onChange,busy,canWrite}=props;
  const annotations=draft.teacherAnnotations ?? submission.teacherAnnotations;
  const annotationChanged=!sameEssayAnnotations(annotations,submission.teacherAnnotations,submission);
  const [toolsTarget,setToolsTarget]=useState(null);
  const [toolsOpen,setToolsOpen]=useState(false);
  return <div className="essay-grading-layout">
    <EssaySubmissionViewer key={`${submission.id}:${submission.fileId}:${submission.submittedAt}`} submission={submission} value={annotations} disabled={busy || !canWrite} loadFile={props.loadFile} toolbarTarget={toolsTarget} toolsOpen={toolsOpen} onChange={value=>onChange('teacherAnnotations',value)} />
    <aside className="essay-grading-sidebar" aria-label="Công cụ và điểm bài làm"><details className="essay-view-tools" open={toolsOpen}><summary onClick={event=>{event.preventDefault();setToolsOpen(open=>!open);}}>Công cụ trên bài · xoay, cắt, bút</summary><div className="essay-sidebar-tools" ref={setToolsTarget} /></details>
      <TeacherEssayReview key={submission.id} {...props} compact annotationChanged={annotationChanged} />
    </aside>
  </div>;
}
