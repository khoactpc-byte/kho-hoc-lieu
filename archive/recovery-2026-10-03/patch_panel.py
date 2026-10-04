import re

with open('src/features/tran-hung-dao/ThdTeachingAssignmentsPanel.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    '  activeAssignmentClasses = [],',
    '  activeTeachingVersionId = "main",\n  setActiveTeachingVersionId,\n  teachingVersionsForSelectedYear = [],\n  handleCreateNewTeachingVersion,\n  activeAssignmentClasses = [],'
)

content = content.replace(
    '<ThdTeachingAssignmentsToolbar\n        activeTeachingBatch={activeTeachingBatch}',
    '<ThdTeachingAssignmentsToolbar\n        activeTeachingVersionId={activeTeachingVersionId}\n        setActiveTeachingVersionId={setActiveTeachingVersionId}\n        teachingVersionsForSelectedYear={teachingVersionsForSelectedYear}\n        handleCreateNewTeachingVersion={handleCreateNewTeachingVersion}\n        activeTeachingBatch={activeTeachingBatch}'
)

with open('src/features/tran-hung-dao/ThdTeachingAssignmentsPanel.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched ThdTeachingAssignmentsPanel")
