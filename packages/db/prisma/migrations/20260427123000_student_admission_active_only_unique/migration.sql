DROP INDEX IF EXISTS "Student_schoolId_admissionNo_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Student_schoolId_admissionNo_active_unique"
ON "Student" ("schoolId", "admissionNo")
WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS "Student_schoolId_admissionNo_idx"
ON "Student" ("schoolId", "admissionNo");
