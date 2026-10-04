import re

with open('src/components/AdminSettingsWorkspace.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add activeTeachingVersionId state
content = re.sub(
    r'(const \[teachingAssignmentsDirty, setTeachingAssignmentsDirty\] = useState\(false\);)',
    r'\1\n  const [activeTeachingVersionId, setActiveTeachingVersionId] = useState("main");',
    content
)

# Replace effectiveSchoolYearKey with activeTeachingDataKey for activeTeachingAssignmentsDraft
# First, insert activeTeachingDataKey definition after effectiveSchoolYearKey definition
content = re.sub(
    r'(const effectiveSchoolYearKey = adminSelectedSchoolYear \|\| selectedSchoolYear;)',
    r'\1\n  const activeTeachingDataKey = activeTeachingVersionId === "main" ? effectiveSchoolYearKey : `${effectiveSchoolYearKey}_${activeTeachingVersionId}`;',
    content
)

# Then, replace effectiveSchoolYearKey with activeTeachingDataKey ONLY when reading/writing activeTeachingAssignmentsDraft
content = content.replace(
    'prevObj.batchesByYear?.[effectiveSchoolYearKey]',
    'prevObj.batchesByYear?.[activeTeachingDataKey]'
)
content = content.replace(
    'prevObj.byYear?.[effectiveSchoolYearKey]',
    'prevObj.byYear?.[activeTeachingDataKey]'
)
content = content.replace(
    'batchesByYear: {\n          ...(prevObj.batchesByYear || {}),\n          [effectiveSchoolYearKey]: nextBatches\n        }',
    'batchesByYear: {\n          ...(prevObj.batchesByYear || {}),\n          [activeTeachingDataKey]: nextBatches\n        }'
)
content = content.replace(
    'byYear: {\n          ...(prevObj.byYear || {}),\n          [effectiveSchoolYearKey]: summaryRows\n        }',
    'byYear: {\n          ...(prevObj.byYear || {}),\n          [activeTeachingDataKey]: summaryRows\n        }'
)
content = content.replace(
    'activeTeachingAssignmentsDraft?.batchesByYear?.[effectiveSchoolYearKey]',
    'activeTeachingAssignmentsDraft?.batchesByYear?.[activeTeachingDataKey]'
)
content = content.replace(
    'activeTeachingAssignmentsDraft?.byYear?.[effectiveSchoolYearKey]',
    'activeTeachingAssignmentsDraft?.byYear?.[activeTeachingDataKey]'
)
content = content.replace(
    'activeTeachingAssignmentsDraft?.semestersByYear?.[effectiveSchoolYearKey]',
    'activeTeachingAssignmentsDraft?.semestersByYear?.[activeTeachingDataKey]'
)

# Also update buildTeachingAssignmentsForSave
content = content.replace(
    'assignmentObj.batchesByYear?.[effectiveSchoolYearKey]',
    'assignmentObj.batchesByYear?.[activeTeachingDataKey]'
)
content = content.replace(
    'assignmentObj.batchesByYear[effectiveSchoolYearKey]',
    'assignmentObj.batchesByYear[activeTeachingDataKey]'
)
content = content.replace(
    'assignmentObj.byYear?.[effectiveSchoolYearKey]',
    'assignmentObj.byYear?.[activeTeachingDataKey]'
)
content = content.replace(
    'assignmentObj.byYear[effectiveSchoolYearKey]',
    'assignmentObj.byYear[activeTeachingDataKey]'
)
content = content.replace(
    'batchesByYear: {\n      ...(assignmentObj.batchesByYear || {}),\n      [effectiveSchoolYearKey]: batchesForSave\n    }',
    'batchesByYear: {\n      ...(assignmentObj.batchesByYear || {}),\n      [activeTeachingDataKey]: batchesForSave\n    }'
)
content = content.replace(
    'byYear: {\n      ...(assignmentObj.byYear || {}),\n      [effectiveSchoolYearKey]: summaryRowsForSave\n    }',
    'byYear: {\n      ...(assignmentObj.byYear || {}),\n      [activeTeachingDataKey]: summaryRowsForSave\n    }'
)
content = content.replace(
    'semestersByYear: {\n      ...(assignmentObj.semestersByYear || {}),\n      [effectiveSchoolYearKey]: semestersForSave\n    }',
    'semestersByYear: {\n      ...(assignmentObj.semestersByYear || {}),\n      [activeTeachingDataKey]: semestersForSave\n    }'
)


# Add teachingVersionsForSelectedYear
new_memo = """  const teachingVersionsForSelectedYear = useMemo(() => {
    const versionsKey = `${effectiveSchoolYearKey}_versions`;
    const versions = activeTeachingAssignmentsDraft?.[versionsKey] || [];
    if (!versions.some(v => v.id === "main")) {
      return [{ id: "main", name: "Bản phân công hiện tại" }, ...versions];
    }
    return versions;
  }, [activeTeachingAssignmentsDraft, effectiveSchoolYearKey]);

  const handleCreateNewTeachingVersion = useCallback(() => {
    const newId = `v${Date.now()}`;
    const newName = `Bản phân công mới - ${new Date().toLocaleDateString('vi-VN')}`;
    setActiveTeachingAssignmentsDraft(prev => {
      const prevObj = (prev && typeof prev === 'object') ? prev : {};
      const versionsKey = `${effectiveSchoolYearKey}_versions`;
      const existingVersions = prevObj[versionsKey] || [];
      const newVersions = existingVersions.some(v => v.id === "main")
        ? [...existingVersions, { id: newId, name: newName }]
        : [{ id: "main", name: "Bản phân công hiện tại" }, ...existingVersions, { id: newId, name: newName }];
      
      return {
        ...prevObj,
        [versionsKey]: newVersions
      };
    });
    setActiveTeachingVersionId(newId);
  }, [effectiveSchoolYearKey, setActiveTeachingAssignmentsDraft]);"""

content = re.sub(
    r'(const teachingBatchesForSelectedYear = useMemo\(\(\) => \{)',
    new_memo + r'\n\n  \1',
    content
)

# Add activeTeachingVersionId and teachingVersionsForSelectedYear to ThdTeachingAssignmentsPanel props
content = content.replace(
    '<ThdTeachingAssignmentsPanel\n                activeAssignmentClasses={activeAssignmentClasses}',
    '<ThdTeachingAssignmentsPanel\n                activeTeachingVersionId={activeTeachingVersionId}\n                setActiveTeachingVersionId={setActiveTeachingVersionId}\n                teachingVersionsForSelectedYear={teachingVersionsForSelectedYear}\n                handleCreateNewTeachingVersion={handleCreateNewTeachingVersion}\n                activeAssignmentClasses={activeAssignmentClasses}'
)

with open('src/components/AdminSettingsWorkspace.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched AdminSettingsWorkspace")
