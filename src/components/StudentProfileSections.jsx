import { useId, useRef, useState } from 'react';

export default function StudentProfileSections({ sections, onSectionChange }) {
  const [selectedKey, setSelectedKey] = useState(sections[0]?.key);
  const id = useId();
  const tabRefs = useRef([]);
  const selectedIndex = Math.max(0, sections.findIndex(section => section.key === selectedKey));
  const selected = sections[selectedIndex];
  if (!selected) return null;
  const selectSection = key => {
    setSelectedKey(key);
    onSectionChange?.(key);
  };

  const handleKeyDown = (event, index) => {
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % sections.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + sections.length) % sections.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = sections.length - 1;
    else return;
    event.preventDefault();
    selectSection(sections[nextIndex].key);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div role="tablist" aria-label="Các mục hồ sơ" className="flex min-w-0 shrink-0 flex-wrap gap-1 border-b border-slate-200 bg-slate-50 px-2 sm:px-3">
        {sections.map((section, index) => (
          <button key={section.key} ref={element => { tabRefs.current[index] = element; }} type="button" role="tab" id={`${id}-tab-${section.key}`} aria-selected={index === selectedIndex} aria-controls={`${id}-panel-${section.key}`} tabIndex={index === selectedIndex ? 0 : -1} onClick={() => selectSection(section.key)} onKeyDown={event => handleKeyDown(event, index)} className={`shrink-0 border-b-2 px-2 py-2 text-xs sm:px-3 sm:text-sm font-normal ${index === selectedIndex ? 'border-sky-700 text-sky-800' : 'border-transparent text-slate-500 hover:text-sky-700'}`}>
            {section.label}
          </button>
        ))}
      </div>
      <div key={selected.key} role="tabpanel" id={`${id}-panel-${selected.key}`} aria-labelledby={`${id}-tab-${selected.key}`} tabIndex={0} className="student-profile-form min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 outline-none sm:p-4">
        {selected.content}
      </div>
    </div>
  );
}
