import type { NotificationType } from '@medbourse/shared';
import mongoose from 'mongoose';
import { Customer } from '../models/Customer.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';

export interface CreateNotificationInput {
  recipientUserId: mongoose.Types.ObjectId | string;
  type: NotificationType;
  caseId?: mongoose.Types.ObjectId | string | null;
  metadata?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await Notification.create({
    recipientUserId: new mongoose.Types.ObjectId(input.recipientUserId),
    type: input.type,
    caseId: input.caseId ? new mongoose.Types.ObjectId(input.caseId) : null,
    metadata: input.metadata ?? {},
  });
}

export interface NotifyCaseEventInput {
  caseId: mongoose.Types.ObjectId | string;
  customerId: mongoose.Types.ObjectId | string;
  createdByUserId: mongoose.Types.ObjectId | string;
  actorUserId: string;
  target: 'customer' | 'staff';
  type: NotificationType;
  metadata?: Record<string, unknown>;
}

/**
 * Notifies the stakeholders of a case for a given event: the linked customer
 * user (`target: 'customer'`) or the case's assigned staff (`target: 'staff'`).
 * The actor is always excluded so nobody is notified of their own action.
 */
export async function notifyCaseEvent(input: NotifyCaseEventInput): Promise<void> {
  const recipients = new Set<string>();

  if (input.target === 'customer') {
    const owner = await User.findOne(
      { customerId: new mongoose.Types.ObjectId(input.customerId) },
      { _id: 1 },
    ).exec();
    if (owner) recipients.add(owner._id.toString());
  } else {
    recipients.add(input.createdByUserId.toString());
    const customer = await Customer.findById(input.customerId, {
      assignedManagerUserId: 1,
    }).exec();
    if (customer?.assignedManagerUserId) {
      recipients.add(customer.assignedManagerUserId.toString());
    }
  }

  recipients.delete(input.actorUserId);
  if (recipients.size === 0) {
    return;
  }

  await Promise.all(
    [...recipients].map((recipientUserId) =>
      createNotification({
        recipientUserId,
        type: input.type,
        caseId: input.caseId,
        metadata: input.metadata,
      }),
    ),
  );
}
