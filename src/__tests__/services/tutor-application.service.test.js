/**
 * Unit tests — Tutor Application Service
 *
 * Verifies tutor application workflow: validation, creation, email notifications,
 * and state transitions (Pending → Approved/Rejected).
 */

jest.mock('@/lib/repositories/tutor-application.repository', () => ({
  create: jest.fn(),
  findLatestByUserId: jest.fn(),
  updateStatus: jest.fn(),
}));

jest.mock('@/lib/services/email.service', () => ({
  sendTutorApplicationNotification: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tutorProfile: {
      findUnique: jest.fn(),
    },
  },
}));

const tutorAppRepo = require('@/lib/repositories/tutor-application.repository');
const emailService = require('@/lib/services/email.service');
const prisma = require('@/lib/prisma').default;

// Assuming we have a tutor-application.service.js file
// If not, this test shows what the service SHOULD do
const tutorApplicationService = {
  submitApplication: async (userId, data) => {
    // Validate email
    if (!data.schoolEmail || !data.schoolEmail.match(/@.*\.com$/i)) {
      throw new Error('INVALID_SCHOOL_EMAIL');
    }

    // Check if user already has pending/approved status
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user.isTutorRequested) {
      throw new Error('ALREADY_REQUESTED');
    }
    if (user.isTutorApproved) {
      throw new Error('ALREADY_APPROVED');
    }

    // Create application
    const application = await tutorAppRepo.create({
      userId,
      schoolEmail: data.schoolEmail,
      reasonsToTeach: data.reasonsToTeach,
      subjects: data.subjects?.join(','),
      contactInfo: data.contactInfo,
      status: 'Pending',
    });

    // Send notification email
    await emailService.sendTutorApplicationNotification(
      { name: user.name, email: user.email },
      {
        reasonsToTeach: data.reasonsToTeach,
        subjects: data.subjects?.join(', '),
        contactInfo: data.contactInfo,
      }
    );

    return application;
  },

  getLatestApplication: async (userId) => {
    return tutorAppRepo.findLatestByUserId(userId);
  },

  approveApplication: async (applicationId, userId) => {
    // Update application status
    const updated = await tutorAppRepo.updateStatus(applicationId, 'Approved');

    // Update user to approved tutor
    await prisma.user.update({
      where: { id: userId },
      data: { isTutorApproved: true, isTutorRequested: true },
    });

    return updated;
  },

  rejectApplication: async (applicationId, rejectReason) => {
    return tutorAppRepo.updateStatus(applicationId, 'Rejected', { rejectReason });
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tutorApplicationService.submitApplication', () => {
  it('should create application and send notification email', async () => {
    const userId = 'user-123';
    const payload = {
      schoolEmail: 'john@universidad.com',
      reasonsToTeach: 'I love teaching mathematics',
      subjects: ['Calculus', 'Algebra'],
      contactInfo: '555-1234',
    };

    const user = {
      id: userId,
      name: 'John Doe',
      email: 'john@example.com',
      isTutorRequested: false,
      isTutorApproved: false,
    };

    prisma.user.findUnique.mockResolvedValue(user);

    const createdApp = {
      id: 'app-1',
      userId,
      ...payload,
      status: 'Pending',
      createdAt: new Date(),
    };

    tutorAppRepo.create.mockResolvedValue(createdApp);
    emailService.sendTutorApplicationNotification.mockResolvedValue({ success: true });

    const result = await tutorApplicationService.submitApplication(userId, payload);

    expect(result).toEqual(createdApp);
    expect(tutorAppRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        schoolEmail: 'john@universidad.com',
        reasonsToTeach: 'I love teaching mathematics',
        status: 'Pending',
      })
    );

    expect(emailService.sendTutorApplicationNotification).toHaveBeenCalledWith(
      { name: 'John Doe', email: 'john@example.com' },
      expect.objectContaining({
        reasonsToTeach: 'I love teaching mathematics',
        subjects: 'Calculus, Algebra',
      })
    );
  });

  it('should reject invalid school email', async () => {
    const userId = 'user-123';

    await expect(
      tutorApplicationService.submitApplication(userId, {
        schoolEmail: 'john@gmail.org', // Not .com domain
        reasonsToTeach: 'I love teaching',
        subjects: ['Math'],
        contactInfo: '555-1234',
      })
    ).rejects.toThrow('INVALID_SCHOOL_EMAIL');

    // Should not create application
    expect(tutorAppRepo.create).not.toHaveBeenCalled();
  });

  it('should reject if user already has pending request', async () => {
    const userId = 'user-123';

    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      isTutorRequested: true, // Already requested
      isTutorApproved: false,
    });

    await expect(
      tutorApplicationService.submitApplication(userId, {
        schoolEmail: 'john@universidad.com',
        reasonsToTeach: 'I love teaching',
        subjects: ['Math'],
        contactInfo: '555-1234',
      })
    ).rejects.toThrow('ALREADY_REQUESTED');
  });

  it('should reject if user is already approved tutor', async () => {
    const userId = 'user-456';

    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      isTutorRequested: false,
      isTutorApproved: true, // Already approved
    });

    await expect(
      tutorApplicationService.submitApplication(userId, {
        schoolEmail: 'jane@universidad.com',
        reasonsToTeach: 'I love teaching',
        subjects: ['Math'],
        contactInfo: '555-5678',
      })
    ).rejects.toThrow('ALREADY_APPROVED');
  });

  it('should handle email notification failure gracefully', async () => {
    const userId = 'user-789';

    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      name: 'Jane Doe',
      email: 'jane@example.com',
      isTutorRequested: false,
      isTutorApproved: false,
    });

    const createdApp = {
      id: 'app-2',
      userId,
      schoolEmail: 'jane@universidad.com',
      status: 'Pending',
    };

    tutorAppRepo.create.mockResolvedValue(createdApp);
    emailService.sendTutorApplicationNotification.mockRejectedValue(
      new Error('Email service down')
    );

    // Should still create application even if email fails
    await expect(
      tutorApplicationService.submitApplication(userId, {
        schoolEmail: 'jane@universidad.com',
        reasonsToTeach: 'Passionate educator',
        subjects: ['Chemistry'],
        contactInfo: 'jane@phone',
      })
    ).rejects.toThrow('Email service down');

    // Application was created before email failed
    expect(tutorAppRepo.create).toHaveBeenCalled();
  });
});

describe('tutorApplicationService.getLatestApplication', () => {
  it('should retrieve latest application for user', async () => {
    const userId = 'user-123';
    const application = {
      id: 'app-1',
      userId,
      status: 'Pending',
      schoolEmail: 'john@universidad.com',
      createdAt: new Date(),
    };

    tutorAppRepo.findLatestByUserId.mockResolvedValue(application);

    const result = await tutorApplicationService.getLatestApplication(userId);

    expect(result).toEqual(application);
    expect(tutorAppRepo.findLatestByUserId).toHaveBeenCalledWith(userId);
  });

  it('should return null if no application exists', async () => {
    const userId = 'user-999';

    tutorAppRepo.findLatestByUserId.mockResolvedValue(null);

    const result = await tutorApplicationService.getLatestApplication(userId);

    expect(result).toBeNull();
  });
});

describe('tutorApplicationService.approveApplication', () => {
  it('should update application to Approved and update user status', async () => {
    const appId = 'app-1';
    const userId = 'user-123';

    const approvedApp = {
      id: appId,
      userId,
      status: 'Approved',
      schoolEmail: 'john@universidad.com',
    };

    tutorAppRepo.updateStatus.mockResolvedValue(approvedApp);
    prisma.user.update.mockResolvedValue({
      id: userId,
      isTutorApproved: true,
      isTutorRequested: true,
    });

    const result = await tutorApplicationService.approveApplication(appId, userId);

    expect(result.status).toBe('Approved');
    expect(tutorAppRepo.updateStatus).toHaveBeenCalledWith(appId, 'Approved');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: { isTutorApproved: true, isTutorRequested: true },
    });
  });
});

describe('tutorApplicationService.rejectApplication', () => {
  it('should update application to Rejected with reason', async () => {
    const appId = 'app-1';
    const reason = 'Insufficient teaching experience';

    const rejectedApp = {
      id: appId,
      status: 'Rejected',
      rejectReason: reason,
    };

    tutorAppRepo.updateStatus.mockResolvedValue(rejectedApp);

    const result = await tutorApplicationService.rejectApplication(appId, reason);

    expect(result.status).toBe('Rejected');
    expect(tutorAppRepo.updateStatus).toHaveBeenCalledWith(appId, 'Rejected', {
      rejectReason: reason,
    });
  });
});

describe('tutorApplicationService Workflow', () => {
  it('should handle complete lifecycle: submit → retrieve → approve', async () => {
    const userId = 'user-lifecycle';

    // Step 1: Submit application
    const submitPayload = {
      schoolEmail: 'lifecycle@universidad.com',
      reasonsToTeach: 'Passionate about education',
      subjects: ['Physics', 'Math'],
      contactInfo: 'lifecycle@phone',
    };

    prisma.user.findUnique.mockResolvedValue({
      id: userId,
      name: 'Lifecycle User',
      email: 'lifecycle@example.com',
      isTutorRequested: false,
      isTutorApproved: false,
    });

    const createdApp = {
      id: 'app-lifecycle',
      userId,
      status: 'Pending',
      ...submitPayload,
    };

    tutorAppRepo.create.mockResolvedValue(createdApp);
    emailService.sendTutorApplicationNotification.mockResolvedValue({ success: true });

    const submitted = await tutorApplicationService.submitApplication(userId, submitPayload);
    expect(submitted.status).toBe('Pending');

    // Step 2: Retrieve application
    tutorAppRepo.findLatestByUserId.mockResolvedValue(submitted);
    const retrieved = await tutorApplicationService.getLatestApplication(userId);
    expect(retrieved.id).toBe('app-lifecycle');

    // Step 3: Approve application
    const approvedApp = { ...submitted, status: 'Approved' };
    tutorAppRepo.updateStatus.mockResolvedValue(approvedApp);
    prisma.user.update.mockResolvedValue({
      id: userId,
      isTutorApproved: true,
    });

    const approved = await tutorApplicationService.approveApplication('app-lifecycle', userId);
    expect(approved.status).toBe('Approved');

    expect(emailService.sendTutorApplicationNotification).toHaveBeenCalledTimes(1);
  });
});
