import prismaPkg from '@prisma/client';
import bcrypt from 'bcryptjs';

const { PrismaClient, UserRole, StudentRelationType } = prismaPkg as {
  PrismaClient: new () => any;
  UserRole: Record<string, string>;
  StudentRelationType: Record<string, string>;
};

const prisma = new PrismaClient();

async function main() {
  const defaultPasswordHash = await bcrypt.hash('Pass@123', 10);

  const school = await prisma.school.upsert({
    where: { code: 'MP-001' },
    update: {},
    create: {
      name: 'Demo MP Board School',
      code: 'MP-001',
      address: 'Bhopal, Madhya Pradesh'
    }
  });

  const defaultGrades = ['Play Group', 'Nursery', 'KG1', 'KG2', ...Array.from({ length: 12 }, (_, index) => String(index + 1))];
  for (const grade of defaultGrades) {
    await prisma.schoolGradeConfig.upsert({
      where: {
        schoolId_grade: {
          schoolId: school.id,
          grade
        }
      },
      update: {
        sections: ['A', 'B']
      },
      create: {
        schoolId: school.id,
        grade,
        sections: ['A', 'B']
      }
    });
  }

  await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: school.id,
        email: 'admin@schoolerp.local'
      }
    },
    update: {
      loginId: 'ADM001',
      passwordHash: defaultPasswordHash,
      role: UserRole.SUPER_ADMIN
    },
    create: {
      schoolId: school.id,
      loginId: 'ADM001',
      firstName: 'Super',
      lastName: 'Admin',
      email: 'admin@schoolerp.local',
      passwordHash: defaultPasswordHash,
      role: UserRole.SUPER_ADMIN
    }
  });

  const teacher = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: school.id,
        email: 'teacher@schoolerp.local'
      }
    },
    update: {
      loginId: 'TCH001',
      passwordHash: defaultPasswordHash,
      role: UserRole.TEACHER,
      assignedClass: '10',
      assignedSection: 'A',
      subjects: ['Mathematics', 'Science']
    },
    create: {
      schoolId: school.id,
      loginId: 'TCH001',
      firstName: 'Neha',
      lastName: 'Teacher',
      email: 'teacher@schoolerp.local',
      passwordHash: defaultPasswordHash,
      role: UserRole.TEACHER,
      assignedClass: '10',
      assignedSection: 'A',
      subjects: ['Mathematics', 'Science']
    }
  });

  const studentUser = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: school.id,
        email: 'student@schoolerp.local'
      }
    },
    update: {
      loginId: 'ADM-1001',
      passwordHash: defaultPasswordHash,
      role: UserRole.STUDENT
    },
    create: {
      schoolId: school.id,
      loginId: 'ADM-1001',
      firstName: 'Rahul',
      lastName: 'Student',
      email: 'student@schoolerp.local',
      passwordHash: defaultPasswordHash,
      role: UserRole.STUDENT
    }
  });

  const studentUser2 = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: school.id,
        email: 'student2@schoolerp.local'
      }
    },
    update: {
      loginId: 'ADM-1002',
      passwordHash: defaultPasswordHash,
      role: UserRole.STUDENT
    },
    create: {
      schoolId: school.id,
      loginId: 'ADM-1002',
      firstName: 'Pranav',
      lastName: 'Kumar',
      email: 'student2@schoolerp.local',
      passwordHash: defaultPasswordHash,
      role: UserRole.STUDENT
    }
  });

  const parentUser = await prisma.user.upsert({
    where: {
      schoolId_email: {
        schoolId: school.id,
        email: 'parent@schoolerp.local'
      }
    },
    update: {
      loginId: 'PAR001',
      passwordHash: defaultPasswordHash,
      role: UserRole.PARENT
    },
    create: {
      schoolId: school.id,
      loginId: 'PAR001',
      firstName: 'Suman',
      lastName: 'Parent',
      email: 'parent@schoolerp.local',
      passwordHash: defaultPasswordHash,
      role: UserRole.PARENT
    }
  });

  const existingStudent = await prisma.student.findFirst({
    where: {
      schoolId: school.id,
      admissionNo: 'ADM-1001',
      isActive: true
    }
  });

  const student =
    existingStudent ??
    (await prisma.student.create({
      data: {
        schoolId: school.id,
        admissionNo: 'ADM-1001',
        firstName: 'Rahul',
        lastName: 'Sharma',
        className: '10',
        section: 'A',
        guardianPhone: '9876543210'
      }
    }));

  const existingStudent2 = await prisma.student.findFirst({
    where: {
      schoolId: school.id,
      admissionNo: 'ADM-1002',
      isActive: true
    }
  });

  const student2 =
    existingStudent2 ??
    (await prisma.student.create({
      data: {
        schoolId: school.id,
        admissionNo: 'ADM-1002',
        firstName: 'Pranav',
        lastName: 'Kumar',
        className: '12',
        section: 'B',
        guardianPhone: '9876501234'
      }
    }));

  await prisma.studentAccess.upsert({
    where: {
      userId_studentId: {
        userId: studentUser.id,
        studentId: student.id
      }
    },
    update: { relation: StudentRelationType.STUDENT },
    create: {
      userId: studentUser.id,
      studentId: student.id,
      relation: StudentRelationType.STUDENT
    }
  });

  await prisma.studentAccess.upsert({
    where: {
      userId_studentId: {
        userId: studentUser2.id,
        studentId: student2.id
      }
    },
    update: { relation: StudentRelationType.STUDENT },
    create: {
      userId: studentUser2.id,
      studentId: student2.id,
      relation: StudentRelationType.STUDENT
    }
  });

  await prisma.studentAccess.upsert({
    where: {
      userId_studentId: {
        userId: parentUser.id,
        studentId: student.id
      }
    },
    update: { relation: StudentRelationType.PARENT },
    create: {
      userId: parentUser.id,
      studentId: student.id,
      relation: StudentRelationType.PARENT
    }
  });

  const existingPayStub = await prisma.payStub.findFirst({
    where: {
      teacherId: teacher.id,
      month: '2026-04'
    }
  });

  if (!existingPayStub) {
    await prisma.payStub.create({
      data: {
        teacherId: teacher.id,
        month: '2026-04',
        amount: 35000,
        note: 'Monthly salary disbursed'
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
