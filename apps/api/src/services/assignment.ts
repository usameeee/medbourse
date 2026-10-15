import type { AssignmentStatus, UserRole } from '@medbourse/shared';
import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { CountryAssignment } from '../models/CountryAssignment.js';
import { User } from '../models/User.js';

const MANAGER_ROLES: readonly UserRole[] = ['staff', 'admin', 'super_admin'];

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

/** Active accounts that may be assigned as customer managers (staff, admin, super_admin). */
export async function listAssignableManagers() {
  return User.find({ isActive: true, role: { $in: MANAGER_ROLES } })
    .sort({ email: 1 })
    .exec();
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
