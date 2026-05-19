export type PlanStory = {
  id: string;
  title: string;
  priority?: number;
  passes?: boolean;
  notes?: string;
  [key: string]: unknown;
};

export type PlanFile = {
  project?: string;
  branchName?: string;
  description?: string;
  stories: PlanStory[];
  [key: string]: unknown;
};

export type PlanStatus =
  | { kind: 'NO_PLAN'; status: 'NO_PLAN'; planPath: string }
  | { kind: 'ALL_DONE'; status: 'ALL_DONE'; planPath: string; totalStories: number }
  | {
      kind: 'PENDING';
      status: 'PENDING';
      planPath: string;
      pendingCount: number;
      nextStory: PlanStory;
      message: string;
    };

export type NextStorySelection =
  | { kind: 'ALL_DONE'; status: 'ALL_DONE'; totalStories: number }
  | { kind: 'PENDING'; status: 'PENDING'; nextStory: PlanStory };

export type SelfScheduleOutput =
  | {
      kind: 'NO_PLAN';
      exitCode: 0;
      lines: string[];
    }
  | {
      kind: 'ALL_DONE';
      exitCode: 0;
      lines: string[];
    }
  | {
      kind: 'PENDING';
      exitCode: 0;
      lines: string[];
      message: string;
    };
