import { roleHasPermission, type UserRole } from '@medbourse/shared';
import mongoose from 'mongoose';
import { AppError } from '../errors/AppError.js';
import { Case, type CaseDocument } from '../models/Case.js';
import { CountryAssignment } from '../models/CountryAssignment.js';
import { Customer } from '../models/Customer.js';

export type AccessibleCustomerScope =
  | { type: 'all' }
  | { type: 'ids'; customerIds: mongoose.Types.ObjectId[] };

async function staffScopeCustomerIds(userId: string): Promise<mongoose.Types.ObjectId[]> {
  const managerId = new mongoose.Types.ObjectId(userId);
  const assignments = await CountryAssignment.find({
    managerUserIds: managerId,
    isActive: true,
  }).exec();
  const countryCodes = assignments.map((a) => a.countryCode);
  const customers = await Customer.find(
    {
      $or: [
        { countryCode: { $in: countryCodes } },
        { assignedManagerUserId: managerId },
      ],
    },
    { _id: 1 },
  ).exec();
  return customers.map((c) => c._id);
}

async function isCustomerInStaffScope(userId: string, customerId: string): Promise<boolean> {
  const customer = await Customer.findById(customerId).exec();
  if (!customer) {
    return false;
  }
  const managerId = new mongoose.Types.ObjectId(userId);
  if (customer.assignedManagerUserId?.toString() === userId) {
    return true;
  }
  const assignment = await CountryAssignment.findOne({
    countryCode: customer.countryCode,
    managerUserIds: managerId,
    isActive: true,
  }).exec();
  return !!assignment;
}

export async function getAccessibleCustomerScope(
  auth: { userId: string; role: UserRole; customerId: string | null },
  permission: 'customer:read:staff' | 'document:review:staff' = 'customer:read:staff',
): Promise<AccessibleCustomerScope> {
  if (auth.role === 'super_admin') {
    return { type: 'all' };
  }
  if (!roleHasPermission(auth.role, permission)) {
    return {
      type: 'ids',
      customerIds: auth.customerId ? [new mongoose.Types.ObjectId(auth.customerId)] : [],
    };
  }
  return { type: 'ids', customerIds: await staffScopeCustomerIds(auth.userId) };
}

export async function canReadCase(
  auth: { userId: string; role: UserRole; customerId: string | null },
  customerId: string,
): Promise<boolean> {
  if (auth.role === 'super_admin') {
    return true;
  }
  if (!roleHasPermission(auth.role, 'customer:read:staff')) {
    return auth.customerId === customerId;
  }
  return isCustomerInStaffScope(auth.userId, customerId);
}

export async function canManageCaseDocuments(
  auth: { userId: string; role: UserRole; customerId: string | null },
  customerId: string,
): Promise<boolean> {
  if (auth.role === 'super_admin') {
    return true;
  }
  if (!roleHasPermission(auth.role, 'document:review:staff')) {
    return auth.customerId === customerId;
  }
  return isCustomerInStaffScope(auth.userId, customerId);
}

export async function loadAuthorizedCase(
  caseId: string,
  auth: { userId: string; role: UserRole; customerId: string | null },
  mode: 'read' | 'documents',
): Promise<CaseDocument> {
  const item = await Case.findById(caseId).exec();
  if (!item) {
    throw new AppError(404, 'NOT_FOUND', 'Case not found');
  }
  const allowed =
    mode === 'documents'
      ? await canManageCaseDocuments(auth, item.customerId.toString())
      : await canReadCase(auth, item.customerId.toString());
  if (!allowed) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
  return item;
}
