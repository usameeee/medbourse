import mongoose from 'mongoose';
import { generateInvitationToken, hashInvitationToken, INVITATION_TTL_MS } from '../auth/invitationToken.js';
import { AppError } from '../errors/AppError.js';
import { recordOutboundMail } from '../mail/devMail.js';
import { Customer } from '../models/Customer.js';
import { Invitation, toPublicInvitation } from '../models/Invitation.js';
import { User } from '../models/User.js';
import { writeAudit } from './assignment.js';

const INVALID = new AppError(400, 'INVALID_INVITATION', 'Invitation is invalid or expired');

export async function assertInvitationUsable(tokenHash: string, email: string): Promise<void> {
  const invitation = await Invitation.findOne({ tokenHash }).exec();
  if (!invitation || invitation.revokedAt || invitation.consumedAt) {
    throw INVALID;
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw INVALID;
  }
  if (invitation.email !== email) {
    throw INVALID;
  }
}

export async function issueInvitation(input: {
  customerId: string;
  emailFromStaff?: string;
  actorUserId: string;
}) {
  const customer = await Customer.findById(input.customerId).exec();
  if (!customer) {
    throw new AppError(404, 'NOT_FOUND', 'Customer not found');
  }
  const email = (input.emailFromStaff ?? customer.email ?? '').toLowerCase();
  if (!email) {
    throw new AppError(400, 'EMAIL_REQUIRED', 'Provide an email for this invitation');
  }
  if (customer.email && customer.email !== email) {
    throw new AppError(
      400,
      'EMAIL_MISMATCH',
      'Invitation email must match the customer record email',
    );
  }
  const alreadyLinked = await User.findOne({ customerId: customer._id }).exec();
  if (alreadyLinked) {
    throw new AppError(409, 'CUSTOMER_ALREADY_LINKED', 'This customer record is already linked to an account');
  }

  await Invitation.updateMany(
    { customerId: customer._id, consumedAt: null, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  const token = generateInvitationToken();
  const invitation = await Invitation.create({
    customerId: customer._id,
    email,
    tokenHash: hashInvitationToken(token),
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    createdByUserId: new mongoose.Types.ObjectId(input.actorUserId),
  });

  recordOutboundMail('customer-invitation', email);
  await writeAudit({
    actorUserId: input.actorUserId,
    action: 'invitation.issued',
    entityType: 'Customer',
    entityId: customer._id.toString(),
    metadata: { invitationId: invitation._id.toString(), email },
  });

  return { invitation: toPublicInvitation(invitation), token };
}

export async function consumeInvitation(input: {
  tokenHash: string;
  user: { _id: mongoose.Types.ObjectId; email: string; customerId: mongoose.Types.ObjectId | null; role: string };
  actorUserId: string;
}): Promise<{ customerId: string }> {
  const invitation = await Invitation.findOne({ tokenHash: input.tokenHash }).exec();
  if (!invitation || invitation.revokedAt || invitation.consumedAt) {
    throw INVALID;
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    throw INVALID;
  }
  if (invitation.email !== input.user.email) {
    throw INVALID;
  }
  if (input.user.role !== 'customer') {
    throw new AppError(403, 'FORBIDDEN', 'Only a customer account can accept this invitation');
  }
  if (input.user.customerId) {
    throw new AppError(409, 'ALREADY_LINKED', 'This account is already linked to a customer record');
  }

  const taken = await User.findOne({ customerId: invitation.customerId }).exec();
  if (taken) {
    throw new AppError(409, 'CUSTOMER_ALREADY_LINKED', 'This customer record is already linked to an account');
  }

  const customer = await Customer.findById(invitation.customerId).exec();
  if (!customer) {
    throw INVALID;
  }

  const user = await User.findById(input.user._id).exec();
  if (!user) {
    throw INVALID;
  }
  user.customerId = invitation.customerId;
  invitation.consumedAt = new Date();
  invitation.consumedByUserId = user._id;
  await user.save();
  await invitation.save();

  await writeAudit({
    actorUserId: input.actorUserId,
    action: 'invitation.consumed',
    entityType: 'Customer',
    entityId: invitation.customerId.toString(),
    metadata: { invitationId: invitation._id.toString(), userId: user._id.toString() },
  });

  return { customerId: invitation.customerId.toString() };
}
