/** Public contract. Private prompts, credentials and owner IDs never enter these DTOs. */
export type LearningFormat = 'text' | 'comic';
export type StoryLength = 'standard' | 'long';
export type JobStatus = 'queued' | 'running' | 'paused' | 'failed' | 'completed';
export type JobPhase = 'knowledge' | 'story-1' | 'story-2' | 'lesson' | 'review' | 'repair-story-1' | 'repair-story-2' | 'repair-lesson' | 'review-final' | 'images' | 'complete';
export interface KnowledgeDTO {
  concept: string; definition: string; coreRelations: string[]; prerequisites: string[];
  misconceptions: string[]; academicUse: string; searchTerms: string[];
  sources: { title: string; authors: string; year: string; url?: string; verificationStatus: 'unverified' }[];
}
export interface PageDTO {
  id: string; title: string; text: string; alt: string; paragraphIds: string[];
  image: { status: 'not_requested' | 'pending' | 'generating' | 'ready' | 'failed'; url?: string; error?: string };
}
export interface StoryDTO {
  id: string; title: string; sourceDomain: string; text: string;
  characters: { name: string; visualDesign: string }[];
  paragraphs: { id: string; text: string }[]; pages: PageDTO[];
}
export interface LessonDTO {
  definition: string; principles: string[]; academicExplanation: string;
  mapping: { storyId: string; paragraphId: string; quote: string; relation: string; explanation: string }[];
  boundaries: string[]; workedExample: string;
}
export interface TaskDTO {
  id: string; kind: 'comprehension' | 'comparison' | 'application'; prompt: string;
  options: { id: string; text: string }[]; correctAnswer: string; explanation: string;
}
export interface DiscussionDTO { prompt: string; guidance: string; }
export interface JobErrorDTO { code: string; message: string; recoverable: boolean; }
export interface JobRetryDTO { attempt: number; nextAttemptAt: string; reason: 'network' | 'timeout' | 'busy' | 'service'; }
export interface JobDTO {
  id: string; concept: string; format: LearningFormat; status: JobStatus; phase: JobPhase;
  /** New jobs have one story; absence in saved legacy records means two. */
  storyCount?: 1 | 2;
  /** Missing in legacy records means standard; long stories support text only. */
  storyLength?: StoryLength;
  createdAt: string; updatedAt: string;
  progress: { completedStages: string[]; stageLabel: string; elapsedMs: number; etaMs: number | null; attempts: number; attemptBudget: number; retrying?: boolean; retry?: JobRetryDTO | null };
  knowledge: KnowledgeDTO | null; stories: StoryDTO[]; lesson: LessonDTO | null;
  tasks: TaskDTO[]; discussion: DiscussionDTO[];
  error: JobErrorDTO | null; quality: 'pending' | 'checked' | 'needs_review';
  provenance: 'generated' | 'preset';
}
export interface ApiError { error: { code: string; message: string; recoverable?: boolean }; }
export interface AccessResponse { unlocked: boolean; }
export interface CreateJobRequest { concept: string; format: LearningFormat; clientRequestId: string; storyLength?: StoryLength; }
export interface JobResponse { job: JobDTO; }
export interface JobsResponse { jobs: JobDTO[]; }
export interface LibraryBookDTO extends Pick<JobDTO, 'id' | 'concept' | 'format' | 'status' | 'phase' | 'createdAt' | 'updatedAt' | 'progress' | 'error' | 'quality' | 'provenance'> {
  title: string; opening: string; coverUrl?: string;
}
export interface LibraryResponse { username: string; books: LibraryBookDTO[]; }
export interface UserDTO { username: string; displayName: string; }
export interface SessionResponse { user: UserDTO | null; legacyImportCount: number; }
export interface AuthResponse extends SessionResponse { recoveryCode?: string; }
export interface ShareDTO { url: string; createdAt: string; }
export interface ShareResponse { share: ShareDTO | null; }
export type SharedStoryDTO = Omit<StoryDTO, 'characters'> & { characters: { name: string }[] };
export interface SharedModuleDTO {
  concept: string; format: LearningFormat; createdAt: string;
  storyLength?: StoryLength;
  stories: SharedStoryDTO[]; knowledge: KnowledgeDTO | null; lesson: LessonDTO;
  tasks: TaskDTO[]; discussion: DiscussionDTO[];
  quality: 'checked'; provenance: 'generated' | 'preset';
}
export interface PublicShareResponse { shared: SharedModuleDTO; }
// GET /learn/api/access; POST /learn/api/access {code}; GET/POST /learn/api/jobs;
// GET /learn/api/jobs/:id; POST .../:id/pause, .../:id/resume; POST .../:id/format {format}.
// All mutating requests require application/json and same-origin Origin (when present).
// Poll a running job; completed content remains readable while subsequent stages run.
