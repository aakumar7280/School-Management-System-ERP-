DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "User_loginId_key";
DROP INDEX IF EXISTS "Student_admissionNo_key";

CREATE UNIQUE INDEX IF NOT EXISTS "User_schoolId_email_key" ON "User"("schoolId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_schoolId_loginId_key" ON "User"("schoolId", "loginId");
CREATE UNIQUE INDEX IF NOT EXISTS "Student_schoolId_admissionNo_key" ON "Student"("schoolId", "admissionNo");