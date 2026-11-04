import type { AssignmentStatus, UserRole } from '@medbourse/shared';
import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { CountryAssignment } from '../models/CountryAssignment.js';
import { User } from '../models/User.js';

const MANAGER_ROLES: readonly UserRole[] = ['admin', 'super_admin'];

export interface ResolvedAssignment {
  assignedManagerUserId: mongoose.Types.ObjectId | null;
  assignmentStatus: AssignmentStatus;
  assignmentSource: 'country_map' | 'none';
}

export async function resolveCountryAssignment(countryCode: string): Promise<ResolvedAssignment> {
  const mapping = await CountryAssignment.findOne({ countryCode, isActive: true }).exec();
  if (!mapping) {
    return {
      assignedManagerUserId: null,
      assignmentStatus: 'unassigned',
      assignmentSource: 'none',
    };
  }

  const primaryId = mapping.managerUserIds[0];
  if (!primaryId) {
    return {
      assignedManagerUserId: null,
      assignmentStatus: 'exception',
      assignmentSource: 'none',
    };
  }

  const manager = await User.findById(primaryId).exec();
  if (!manager || !manager.isActive || !MANAGER_ROLES.includes(manager.role)) {
    return {
      assignedManagerUserId: null,
      assignmentStatus: 'exception',
      assignmentSource: 'none',
    };
  }

  return {
    assignedManagerUserId: manager._id,
    assignmentStatus: 'assigned',
    assignmentSource: 'country_map',
  };
}

export async function assertAssignableManager(userId: string) {
  const manager = await User.findById(userId).exec();
  if (!manager || !manager.isActive || !MANAGER_ROLES.includes(manager.role)) {
    return null;
  }
  return manager;
}

/** Active accounts that may be assigned as customer managers (admin, super_admin). */
export async function listAssignableManagers() {
  return User.find({ isActive: true, role: { $in: MANAGER_ROLES } })
    .sort({ email: 1 })
    .exec();
}

/** Country codes whose active assignment includes this user. Drives the assigned-scope payment rules. */
export async function listAssignedCountryCodes(userId: string): Promise<string[]> {
  const rows = await CountryAssignment.find({
    isActive: true,
    managerUserIds: new mongoose.Types.ObjectId(userId),
  }).exec();
  return rows.map((row) => row.countryCode);
}

export async function writeAudit(input: {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await AuditLog.create({
    actorUserId: input.actorUserId ? new mongoose.Types.ObjectId(input.actorUserId) : null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata ?? {},
  });
}
