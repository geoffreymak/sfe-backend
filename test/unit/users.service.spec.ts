import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { UsersService } from '../../src/users/users.service';
import { User } from '../../src/users/user.schema';
import { Membership } from '../../src/memberships/membership.schema';
import { RbacService } from '../../src/rbac/rbac.service';
import { AuditService } from '../../src/audit/audit.service';
import { ConflictException } from '@nestjs/common';

/**
 * Unit tests for UsersService (mocking Mongoose models and external services)
 */
describe('UsersService (unit)', () => {
  let service: UsersService;

  const makeObjectId = () => new Types.ObjectId();

  let userModel: any;
  let membershipModel: any;
  let rbacService: any;
  let auditService: any;

  beforeEach(async () => {
    userModel = {
      exists: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
    };

    membershipModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      updateOne: jest.fn(),
    };

    rbacService = {
      setMembershipRoles: jest.fn().mockResolvedValue({ roles: [] }),
      getMembership: jest.fn().mockResolvedValue({ roles: [] }),
    } as Partial<RbacService> as any;

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    } as Partial<AuditService> as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Membership.name), useValue: membershipModel },
        { provide: RbacService, useValue: rbacService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('create() lowercases email and sets defaultTenantId from header when absent', async () => {
    const tenantId = makeObjectId().toString();
    const actorId = makeObjectId().toString();
    const email = 'User_One@Example.COM';

    userModel.exists.mockResolvedValue(null);

    let receivedPayload: any;
    userModel.create.mockImplementation((payload: any) => {
      receivedPayload = payload;
      return { ...payload, _id: makeObjectId() };
    });

    const res = await service.create({ email }, actorId, tenantId);

    expect(userModel.exists).toHaveBeenCalledWith({
      email: email.toLowerCase(),
    });
    expect(receivedPayload.email).toBe(email.toLowerCase());
    expect(String(res.defaultTenantId)).toBe(String(tenantId));
    expect(res.email).toBe(email.toLowerCase());
    // No roles provided -> RBAC not called
    expect(rbacService.setMembershipRoles).not.toHaveBeenCalled();
  });

  it('create() with roles delegates to RBAC.setMembershipRoles', async () => {
    const tenantId = makeObjectId().toString();
    const actorId = makeObjectId().toString();
    const email = 'new_user@test.local';

    userModel.exists.mockResolvedValue(null);
    const createdId = makeObjectId();
    userModel.create.mockImplementation((payload: any) => ({
      ...payload,
      _id: createdId,
    }));

    const res = await service.create(
      { email, roles: ['VIEWER', 'ADMIN'] },
      actorId,
      tenantId,
    );

    expect(res.email).toBe(email);
    expect(rbacService.setMembershipRoles).toHaveBeenCalledWith(
      createdId,
      tenantId,
      ['VIEWER', 'ADMIN'],
    );
  });

  it('create() with password sets status "active" and passes a passwordHash to model.create', async () => {
    const tenantId = makeObjectId().toString();
    const actorId = makeObjectId().toString();
    const email = 'pass_user@test.local';

    userModel.exists.mockResolvedValue(null);

    let receivedPayload: any;
    userModel.create.mockImplementation((payload: any) => {
      receivedPayload = payload;
      return { ...payload, _id: makeObjectId() };
    });

    const res = await service.create(
      { email, password: 'Password123!' },
      actorId,
      tenantId,
    );

    expect(receivedPayload).toBeDefined();
    expect(typeof receivedPayload.passwordHash).toBe('string');
    expect(receivedPayload.status).toBe('active');
    expect(res.status).toBe('active');
  });

  it('create() throws 409 Conflict on duplicate email', async () => {
    const tenantId = makeObjectId().toString();
    const actorId = makeObjectId().toString();
    const email = 'dupe@test.local';

    userModel.exists.mockResolvedValue(true);

    await expect(
      service.create({ email }, actorId, tenantId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('softDelete() sets deletedAt and status to inactive', async () => {
    const tenantId = makeObjectId();
    const userId = makeObjectId();
    const actorId = makeObjectId().toString();

    // ensure member of tenant (mock chainable .lean())
    membershipModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: makeObjectId() }),
    });

    const doc: any = {
      _id: userId,
      status: 'active',
      deletedAt: undefined,
      save: jest.fn(function (this: any) {
        return Promise.resolve(this);
      }),
    };

    userModel.findById.mockResolvedValue(doc);

    await service.softDelete(userId.toString(), actorId, tenantId.toString());

    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(doc.status).toBe('inactive');
    // capture audit call and compare resourceId by value
    const call = (auditService.log as jest.Mock).mock.calls.pop();
    expect(call).toBeDefined();
    const arg = call[0];
    expect(arg.action).toBe('user.delete.soft');
    expect(String(arg.resourceId)).toBe(String(userId));
  });
});
