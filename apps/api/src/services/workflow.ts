import { AppError } from '../errors/AppError.js';
import type { CaseDocument, CaseWorkflowStageFields } from '../models/Case.js';
import { Case } from '../models/Case.js';
import type { WorkflowStageStatus } from '@medbourse/shared';
import { WORKFLOW_STAGE_STATUSES } from '@medbourse/shared';
import { writeAudit } from './assignment.js';
import { notifyCaseEvent } from './notifications.js';

const ALLOWED_TRANSITIONS: Record<WorkflowStageStatus, readonly WorkflowStageStatus[]> = {
  pending: ['in_progress', 'done', 'skipped'],
  in_progress: ['done', 'skipped'],
  done: [],
  skipped: [],
};

export interface TransitionInput {
  caseId: string;
  stageId: string;
  targetStatus: WorkflowStageStatus;
  actorUserId: string;
}

export interface TransitionResult {
  stage: CaseWorkflowStageFields;
  previousStatus: WorkflowStageStatus;
}

function findStage(caseDoc: CaseDocument, stageId: string): CaseWorkflowStageFields {
  if (!caseDoc.workflow) {
    throw new AppError(400, 'NO_WORKFLOW', 'Case has no workflow snapshot');
  }
  const stage = caseDoc.workflow.stages.find((s) => s.id === stageId);
  if (!stage) {
    throw new AppError(404, 'STAGE_NOT_FOUND', 'Workflow stage not found on this case');
  }
  return stage;
}

function assertTransitionAllowed(current: WorkflowStageStatus, target: WorkflowStageStatus): void {
  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed.includes(target)) {
    throw new AppError(
      400,
      'INVALID_TRANSITION',
      `Cannot transition stage from '${current}' to '${target}'`,
    );
  }
}

function assertPrerequisitesDone(
  stages: CaseWorkflowStageFields[],
  targetStage: CaseWorkflowStageFields,
): void {
  const blockers = stages.filter(
    (s) => s.order < targetStage.order && !s.optional && s.status !== 'done',
  );
  if (blockers.length > 0) {
    const names = blockers.map((b) => b.id).join(', ');
    throw new AppError(
      409,
      'PREREQUISITE_NOT_DONE',
      `Cannot complete stage '${targetStage.id}': required stages not done: ${names}`,
    );
  }
}

export async function transitionStage(input: TransitionInput): Promise<TransitionResult> {
  if (!WORKFLOW_STAGE_STATUSES.includes(input.targetStatus)) {
    throw new AppError(400, 'INVALID_STATUS', `Invalid stage status: ${input.targetStatus}`);
  }

  const caseDoc = await Case.findById(input.caseId).exec();
  if (!caseDoc) {
    throw new AppError(404, 'NOT_FOUND', 'Case not found');
  }
  if (!caseDoc.workflow) {
    throw new AppError(400, 'NO_WORKFLOW', 'Case has no workflow snapshot');
  }

  const stage = findStage(caseDoc, input.stageId);
  const previousStatus = stage.status;

  assertTransitionAllowed(previousStatus, input.targetStatus);

  if (input.targetStatus === 'skipped' && !stage.optional) {
    throw new AppError(400, 'STAGE_NOT_OPTIONAL', 'Only optional stages can be skipped');
  }

  if (input.targetStatus === 'done') {
    assertPrerequisitesDone(caseDoc.workflow.stages, stage);
  }

  stage.status = input.targetStatus;
  await caseDoc.save();

  await writeAudit({
    actorUserId: input.actorUserId,
    action: 'case.workflow_stage_transitioned',
    entityType: 'Case',
    entityId: caseDoc._id.toString(),
    metadata: {
      stageId: stage.id,
      stageName: stage.name,
      from: previousStatus,
      to: input.targetStatus,
      templateId: caseDoc.workflow.templateId.toString(),
      versionNumber: caseDoc.workflow.versionNumber,
    },
  });

  await notifyCaseEvent({
    caseId: caseDoc._id,
    customerId: caseDoc.customerId,
    createdByUserId: caseDoc.createdByUserId,
    actorUserId: input.actorUserId,
    target: 'customer',
    type: 'case.workflow_stage_transitioned',
    metadata: { stageId: stage.id, stageName: stage.name, to: input.targetStatus },
  });

  return { stage, previousStatus };
}

export function allRequiredStagesDone(caseDoc: CaseDocument): boolean {
  if (!caseDoc.workflow) {
    return false;
  }
  return caseDoc.workflow.stages
    .filter((s) => !s.optional)
    .every((s) => s.status === 'done');
}

export interface CloseCaseInput {
  caseId: string;
  actorUserId: string;
}

export async function closeCase(input: CloseCaseInput): Promise<CaseDocument> {
  const caseDoc = await Case.findById(input.caseId).exec();
  if (!caseDoc) {
    throw new AppError(404, 'NOT_FOUND', 'Case not found');
  }
  if (caseDoc.status === 'closed') {
    throw new AppError(409, 'CASE_ALREADY_CLOSED', 'Case is already closed');
  }
  if (!caseDoc.workflow) {
    throw new AppError(400, 'NO_WORKFLOW', 'Case has no workflow snapshot');
  }
  if (!allRequiredStagesDone(caseDoc)) {
    throw new AppError(
      409,
      'REQUIRED_STAGES_NOT_DONE',
      'Cannot close case: not all required workflow stages are done',
    );
  }

  caseDoc.status = 'closed';
  await caseDoc.save();

  await writeAudit({
    actorUserId: input.actorUserId,
    action: 'case.closed',
    entityType: 'Case',
    entityId: caseDoc._id.toString(),
    metadata: {
      templateId: caseDoc.workflow.templateId.toString(),
      versionNumber: caseDoc.workflow.versionNumber,
    },
  });

  await notifyCaseEvent({
    caseId: caseDoc._id,
    customerId: caseDoc.customerId,
    createdByUserId: caseDoc.createdByUserId,
    actorUserId: input.actorUserId,
    target: 'customer',
    type: 'case.closed',
    metadata: { status: 'closed' },
  });

  return caseDoc;
}
