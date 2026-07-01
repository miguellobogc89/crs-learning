// components/course-editor/types.ts
export type Lesson = {
  id: string;
  title: string;
  content: string;
};

export type Quiz = {
  id: string;
  title: string;
};

export type SectionItem = {
  id: string;
  item_type: string;
  lesson_id: string | null;
  quiz_id: string | null;
  sort_order: number;
  lessons: Lesson | null;
  quizzes: Quiz | null;
};

export type Section = {
  id: string;
  title: string;
  section_items: SectionItem[];
};

export type SelectedItem =
  | { type: "lesson"; lesson: Lesson }
  | { type: "quiz"; quiz: Quiz };